import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Importing the SDK server entry must not load the orchestrion bundler plugins. They are
 * build-time-only, and their module-scope side effects break runtimes the build never sees,
 * like jsdom/happy-dom test runs (issue #23789) and Cloudflare Workers cold starts (issue #22794).
 * Runs in a child process for a clean module cache and real Node resolution.
 */
describe('built CJS server entry', () => {
  const serverEntry = resolve(__dirname, '../build/cjs/index.server.js');

  it('loads under a DOM test environment without pulling in the orchestrion bundler graph', () => {
    const script = `
      globalThis.document = { baseURI: 'http://localhost:3000/' };
      require(${JSON.stringify(serverEntry)});
      const toPosix = modulePath => modulePath.split(require('path').sep).join('/');
      const bundlerModules = Object.keys(require.cache).map(toPosix).filter(
        modulePath => modulePath.includes('code-transformer-bundler-plugins') || modulePath.includes('orchestrion/bundler'),
      );
      if (bundlerModules.length > 0) {
        console.error('Bundler-plugin modules loaded at import time:\\n' + bundlerModules.join('\\n'));
        process.exit(1);
      }
    `;

    // On failure, stderr carries either the leaked module list or the import crash itself.
    const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
  });
});
