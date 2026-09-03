import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Importing the SDK client entry must not load `next/router`. That module is the whole Pages Router client
 * runtime, and a static import of it lands in the client bundle of every app - App Router apps included,
 * which never reach the Pages Router branch of the routing instrumentation. Bundlers cannot remove it
 * (`next` declares no `sideEffects`, and the app/pages decision is made at runtime), so the durable guard
 * is that the entry's module graph does not contain it: `pagesRouterRoutingInstrumentation` imports the
 * router on demand instead. Runs in a child process for a clean module cache and real Node resolution,
 * like `serverEntryBundlerGraph.test.ts`.
 */
describe('built CJS client entry', () => {
  const clientEntry = resolve(__dirname, '../build/cjs/client/index.js');

  it('does not load `next/router` at import time', () => {
    const script = `
      require(${JSON.stringify(clientEntry)});
      const toPosix = modulePath => modulePath.split(require('path').sep).join('/');
      const loaded = Object.keys(require.cache).map(toPosix);
      // Control: the Pages Router instrumentation itself must be in the graph, or an empty list proves nothing.
      if (!loaded.some(modulePath => modulePath.endsWith('/client/routing/pagesRouterRoutingInstrumentation.js'))) {
        console.error('Control failed: the Pages Router routing instrumentation was not loaded at all');
        process.exit(2);
      }
      const routerModules = loaded.filter(
        modulePath => modulePath.endsWith('/next/router.js') || modulePath.includes('/next/dist/client/router'),
      );
      if (routerModules.length > 0) {
        console.error('next/router loaded at import time:\\n' + routerModules.join('\\n'));
        process.exit(1);
      }
    `;

    // On failure, stderr carries the leaked module list, the failed control, or the import crash itself.
    const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
  });
});
