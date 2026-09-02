import { execFileSync } from 'node:child_process';
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
      const bundlerModules = Object.keys(require.cache).filter(
        modulePath => modulePath.includes('code-transformer-bundler-plugins') || modulePath.includes('orchestrion/bundler'),
      );
      if (bundlerModules.length > 0) {
        console.error('Bundler-plugin modules loaded at import time:\\n' + bundlerModules.join('\\n'));
        process.exit(2);
      }
    `;

    expect(() => execFileSync(process.execPath, ['-e', script], { stdio: 'pipe' })).not.toThrow();
  });
});
