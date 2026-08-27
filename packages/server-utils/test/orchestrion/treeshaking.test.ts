import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { rollup } from 'rollup';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// `@sentry/server-utils/orchestrion/register` (the runtime entry `Sentry.init()` calls) pulls in the
// vendored orchestrion transformer chain (`@apm-js-collab/code-transformer` -> meriyah, esquery,
// astring, source-map). Under `preserveModules`, `@rollup/plugin-commonjs` emits a named-export CJS
// dep as an empty proxy object (`var meriyah = {}`) that a *separate* module populates via
// cross-module property writes (`meriyah.parse = parse`), reachable only through a bare side-effect
// import. A downstream bundler that inlines this package drops those "unused" writes, leaving the
// proxy empty, so `parse`/`generate`/the SourceMap constructors are `undefined` and every
// instrumented module load throws deep inside the loader.
// See https://github.com/getsentry/sentry-javascript/issues/23664.
//
// meriyah and astring avoid the shape entirely because the build resolves them to their ESM builds
// (see `esmVendorAlias` in rollup.npm.config.mjs); source-map ships no ESM build, so it stays fragile
// and is instead pinned by the `sideEffects` allowlist in this package's package.json. This test
// re-bundles the built entry the way a downstream bundler does, honouring `sideEffects`, and asserts
// the result still installs working hooks.

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '../..');
const registerEntry = join(packageRoot, 'build/esm/orchestrion/runtime/register.js');

let tmpDir: string;
let bundlePath: string;
let reBundledCode: string;

// The build and the re-bundle happen here, not in a test body, so the whole (potentially slow) job
// runs under one generous timeout. The nx build cache is Node-version-scoped, so on Node versions
// other than the one the CI build job ran on, `build/` is absent and gets built here.
beforeAll(async () => {
  // The vendored chain only exists after this package's rollup build, so the test operates on
  // `build/esm`; build on demand when it is missing.
  if (!existsSync(registerEntry)) {
    execSync('yarn build:transpile', { cwd: packageRoot, stdio: 'inherit' });
  }

  // Inside the package root, not the OS temp dir: the Node < 24.13 registration path resolves
  // `@sentry/server-utils/orchestrion/hook` against the *bundle's* location, which only works from
  // somewhere the installed package is reachable.
  tmpDir = mkdtempSync(join(packageRoot, '.treeshake-'));

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

  reBundledCode = output[0].code;
  bundlePath = join(tmpDir, 'bundle.mjs');
  writeFileSync(bundlePath, reBundledCode);
}, 180_000);

afterAll(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('the vendored orchestrion transformer survives downstream tree-shaking', () => {
  it('installs working hooks from a re-bundled register entry', () => {
    // Run out-of-process: `registerDiagnosticsChannelInjection()` installs module hooks, which we do
    // not want in the vitest worker. It probes the transformer before installing anything and marks
    // `runtimeUnavailable` when the chain came back tree-shaken, so that flag is the assertion.
    const stdout = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        [
          `import { registerDiagnosticsChannelInjection } from ${JSON.stringify(bundlePath)};`,
          'registerDiagnosticsChannelInjection();',
          'console.log(JSON.stringify(globalThis.__SENTRY_ORCHESTRION__));',
        ].join('\n'),
      ],
      { cwd: packageRoot, encoding: 'utf-8' },
    );

    expect(JSON.parse(stdout.trim())).toEqual({ runtime: [] });
  });

  it('keeps every vendored transformer dependency in the re-bundled output', () => {
    // Named so a failure says which dependency the bundler dropped.
    expect(reBundledCode, 'meriyah').toContain('function parseSource(');
    expect(reBundledCode, 'astring').toContain('EXPRESSIONS_PRECEDENCE');
    expect(reBundledCode, 'esquery').toContain('esquery');
    expect(reBundledCode, 'source-map').toMatch(/sourceMap\.SourceMapConsumer =/);
    expect(reBundledCode, 'source-map').toMatch(/sourceMap\.SourceMapGenerator =/);
  });
});
