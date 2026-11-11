import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';
import { parseModule } from 'meriyah';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * `register.ts` hands the ESM loader hook to `Module.register()` by runtime path, so build tracers
 * ship `build/esm/hook.js` without following its imports (Turbopack on Next.js does this). Anything
 * the hook imports beyond Node builtins is then missing on the loader thread. Runs against the
 * built files, so it needs the package built.
 */
const buildDir = join(__dirname, '..', 'build');

function collectSpecifiers(node: unknown, specifiers: string[]): void {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    node.forEach(child => collectSpecifiers(child, specifiers));
    return;
  }
  const { type, source } = node as { type?: string; source?: { type?: string; value?: unknown } };
  if (
    (type === 'ImportDeclaration' ||
      type === 'ExportAllDeclaration' ||
      type === 'ExportNamedDeclaration' ||
      type === 'ImportExpression') &&
    source
  ) {
    specifiers.push(source.type === 'Literal' ? String(source.value) : '<computed>');
  }
  Object.values(node).forEach(child => collectSpecifiers(child, specifiers));
}

describe('the ESM loader hook', () => {
  it('imports nothing but Node builtins', () => {
    const specifiers: string[] = [];
    collectSpecifiers(parseModule(readFileSync(join(buildDir, 'esm', 'hook.js'), 'utf8')), specifiers);

    const builtins = new Set(builtinModules);
    const nonBuiltins = specifiers.filter(s => !(s.startsWith('node:') && builtins.has(s.slice('node:'.length))));

    expect(specifiers.length).toBeGreaterThan(0);
    expect(nonBuiltins).toEqual([]);
  });

  describe('when a deployment ships only the hook from the ESM build', () => {
    // The copy sits inside this package so `register.js` still resolves `@sentry/*` from its
    // `node_modules`.
    const copyDir = mkdtempSync(join(__dirname, '.hook-only-'));
    cpSync(join(buildDir, 'cjs'), join(copyDir, 'build', 'cjs'), { recursive: true });
    mkdirSync(join(copyDir, 'build', 'esm'));
    cpSync(join(buildDir, 'esm', 'hook.js'), join(copyDir, 'build', 'esm', 'hook.js'));

    afterAll(() => {
      rmSync(copyDir, { recursive: true, force: true });
    });

    it('registers it', { timeout: 30_000 }, () => {
      // Removing `registerHooks` forces the `Module.register()` path, the one that loads the hook on
      // Node < 24.13, whatever Node version runs the test.
      const script = `
        require('node:module').registerHooks = undefined;
        const { registerDiagnosticsChannelInjection } = require(${JSON.stringify(join(copyDir, 'build', 'cjs', 'register.js'))});
        registerDiagnosticsChannelInjection();
        import('data:text/javascript,export default 1').then(() => {
          const marker = globalThis.__SENTRY__?.__SENTRY_ORCHESTRION__ ?? globalThis.__SENTRY_ORCHESTRION__;
          process.stdout.write(JSON.stringify(marker));
        });
      `;

      const { stdout, stderr } = spawnSync(process.execPath, ['--no-experimental-detect-module', '-e', script], {
        encoding: 'utf8',
      });

      expect(stderr).not.toContain('Failed to register diagnostics-channel injection hooks');
      expect(JSON.parse(stdout)).toEqual({ runtime: [] });
    });
  });
});
