import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Build tracers can ship the loader hook without the files it imports (Turbopack does), and
 * deployments can drop `build/esm/package.json`. The CJS build must therefore register a hook that
 * needs nothing from `build/esm`. Runs against the built files, so it needs the package built.
 */
const packageDir = join(__dirname, '..');

/** Every file that `entry` reaches through relative `require()` calls. */
function relativeRequireGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) {
      return;
    }
    seen.add(file);
    for (const [, request] of readFileSync(file, 'utf8').matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
      visit(resolve(dirname(file), request!));
    }
  };
  visit(entry);
  return seen;
}

describe('the CJS loader hook', () => {
  // A tracer that copies the hook without following its imports still ships what `register.js`
  // requires. So the hook must need nothing else.
  it('requires only files that register.js requires too', () => {
    const cjsDir = join(packageDir, 'build', 'cjs');
    const registerGraph = relativeRequireGraph(join(cjsDir, 'register.js'));
    const hookGraph = relativeRequireGraph(join(cjsDir, 'hook.js'));

    const hookOnly = [...hookGraph].filter(file => !registerGraph.has(file)).map(file => relative(cjsDir, file));

    expect(hookGraph.size).toBeGreaterThan(1);
    expect(hookOnly).toEqual(['hook.js']);
  });
});

describe('when a deployment ships only the CJS build', () => {
  let copyDir: string;

  // The copy has its own `package.json` so the `@sentry/server-runtime-injection/hook` fallback
  // resolves to the copy and not to the real build.
  beforeAll(() => {
    copyDir = mkdtempSync(join(tmpdir(), 'sentry-cjs-only-'));
    cpSync(join(packageDir, 'package.json'), join(copyDir, 'package.json'));
    cpSync(join(packageDir, 'build', 'cjs'), join(copyDir, 'build', 'cjs'), { recursive: true });
  });

  afterAll(() => {
    rmSync(copyDir, { recursive: true, force: true });
  });

  it('registers the loader hook', { timeout: 30_000 }, () => {
    // Removing `registerHooks` forces the `Module.register()` path, the one that loads the hook on
    // Node < 24.13, whatever Node version runs the test.
    const script = `
      require('node:module').registerHooks = undefined;
      const { registerDiagnosticsChannelInjection } = require(${JSON.stringify(join(copyDir, 'build', 'cjs', 'register.js'))});
      registerDiagnosticsChannelInjection();
      const marker = globalThis.__SENTRY__?.__SENTRY_ORCHESTRION__ ?? globalThis.__SENTRY_ORCHESTRION__;
      process.stdout.write(JSON.stringify(marker));
    `;

    // `NODE_PATH` lets the copy resolve `@sentry/*` from this package's `node_modules`.
    const { stdout, stderr } = spawnSync(process.execPath, ['-e', script], {
      encoding: 'utf8',
      env: { ...process.env, NODE_PATH: join(packageDir, 'node_modules') },
    });

    expect(stderr).not.toContain('Failed to register diagnostics-channel injection hooks');
    expect(JSON.parse(stdout)).toEqual({ runtime: [] });
  });
});
