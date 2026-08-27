import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { rollup } from 'rollup';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// `@sentry/server-utils/orchestrion/register` (the runtime entry the Node SDK requires from
// `Sentry.init()`) pulls in the vendored orchestrion transformer chain
// (`@apm-js-collab/code-transformer` → meriyah, esquery, astring, source-map). Under
// `preserveModules`, `@rollup/plugin-commonjs` emits each named-export CJS dep as an empty proxy
// object (`var meriyah = {}`) that a *separate* module populates via cross-module property writes
// (`meriyah.parse = parse`), reached only through a bare side-effect import. When a downstream
// bundler (Next.js server, serverless, nitro/vite — rollup and rolldown alike) re-bundles
// `@sentry/node`, its tree-shaker drops those "unused" writes, leaving the proxy empty — so at
// runtime `parse`/`generate`/the SourceMap constructors are `undefined` and every instrumented
// module crashes when loaded. esquery survives only because it ships `module.exports = {…}`.
//
// The fix builds `register`/`hook` without `preserveModules`, so the chain lands in one
// self-contained chunk where each dep's proxy object, its population, and its consumer are
// co-located — and Rollup never drops a property write read within the same module. This test
// re-bundles the built `register` entry exactly the way a downstream bundler does (honouring this
// package's `sideEffects`) and asserts the populations survive.
// See https://github.com/getsentry/sentry-javascript/issues/23664.

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '../..');
const registerEntry = join(packageRoot, 'build/esm/orchestrion/runtime/register.js');

let tmpDir: string;

beforeAll(() => {
  // The vendored chain only exists after this package's rollup build, so the test operates on
  // `build/esm`. CI builds before running unit tests; build on demand for local runs.
  if (!existsSync(registerEntry)) {
    execSync('yarn build:transpile', { cwd: packageRoot, stdio: 'inherit' });
  }
  tmpDir = mkdtempSync(join(tmpdir(), 'orchestrion-treeshake-'));
});

afterAll(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

/**
 * Re-bundle the built `register` entry the way a downstream bundler would: importing it from this
 * package (so Rollup reads its `sideEffects` field) and tree-shaking. Returns the emitted code.
 */
async function reBundleRegisterAsDownstream(): Promise<string> {
  const entryPath = join(tmpDir, 'entry.mjs');
  writeFileSync(
    entryPath,
    [
      `import { registerDiagnosticsChannelInjection } from ${JSON.stringify(registerEntry)};`,
      'export { registerDiagnosticsChannelInjection };',
    ].join('\n'),
  );

  const bundle = await rollup({
    input: entryPath,
    plugins: [nodeResolve()],
    external: id => id === '@sentry/core' || id.startsWith('node:') || builtinModules.includes(id),
    onwarn: () => {
      /* the vendored graph has benign circular deps; keep the test output quiet */
    },
  });

  const { output } = await bundle.generate({ format: 'esm' });
  await bundle.close();
  return output[0].code;
}

describe('vendored orchestrion transformer survives downstream tree-shaking', () => {
  it('keeps meriyah, astring and source-map populated after re-bundling the register entry', async () => {
    const code = await reBundleRegisterAsDownstream();

    // Each vendored CJS dep is populated by a cross-module property write. If downstream
    // tree-shaking dropped it, the proxy stays `var meriyah = {}` and these assignments vanish —
    // the exact breakage from #23664. Their presence means the chain stayed wired up.
    expect(code).toContain('meriyah.parse = parse');
    expect(code).toMatch(/astring\.generate =/);
    expect(code).toMatch(/sourceMap\.SourceMapConsumer =/);
    expect(code).toMatch(/sourceMap\.SourceMapGenerator =/);
  });
});
