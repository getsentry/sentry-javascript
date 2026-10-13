import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { bundleReferencesModule } from './build-output';

const JS_EXTENSIONS = ['.mjs', '.cjs', '.js'];

/**
 * Describes a bundled first-party workload and how its auto-instrumentation shows up, so
 * {@link assertBundlerInstrumentation} can drive the same build-time / runtime matrix for any
 * instrumented library — not just graphql.
 *
 * The workload itself lives in the test app (`src/app.mjs`, exporting `runWorkload()`); this
 * descriptor is the small amount the assertion needs to know about it.
 */
export interface InstrumentationFixture {
  /**
   * Bare specifier the workload imports the instrumented library by. Used to tell an *inlined* build
   * (the library's source is bundled in) from an *external* one (a bare `import`/`require` left for
   * the runtime `--import` hook to intercept).
   */
  moduleName: string;
  /** `sentry.origin` the instrumentation stamps on the spans it emits. */
  origin: string;
  /**
   * An identifier that appears only in the library's own source. Present in the bundle iff the
   * library was inlined, so it separates an inlined build from an external one.
   */
  sourceMarker: string;
  /** Validates the workload's result — the value `runWorkload()` resolved to, round-tripped as JSON. */
  assertResult: (result: unknown) => boolean;
}

const FIXTURES: Record<string, InstrumentationFixture> = {
  graphql: {
    moduleName: 'graphql',
    origin: 'auto.graphql.diagnostic_channel',
    sourceMarker: 'GraphQLSchema',
    assertResult: result => (result as { data?: { hello?: string } })?.data?.hello === 'world',
  },
};

interface BundleRun {
  result: unknown;
  spans: Array<{ name?: string; origin?: string }>;
}

/**
 * Runs a bundler test app's four built bundles across the build-time and runtime instrumentation
 * paths and asserts that each instrumented scenario emits exactly one set of spans — never zero,
 * never double:
 *
 *   - `plain`           (inlined, no plugin, no `--import`): no spans (negative control),
 *   - `plugin`          (inlined, plugin, no `--import`):    one set, via build-time injection,
 *   - `plain-external`  (external, no plugin, `--import`):   one set, via the runtime hook,
 *   - `plugin-external` (external, plugin, `--import`):      one set — the plugin can't instrument an
 *                                                            external module, so the runtime hook is
 *                                                            the sole injector and there's no double
 *                                                            instrumentation.
 *
 * "One set" is defined relative to the build-time run (`plugin`), so the count stays correct across
 * bundlers and library versions. It also asserts the bundle *shape* (inlined vs external) directly,
 * so an externalization knob that silently becomes a no-op fails here instead of passing by accident.
 * A boot crash surfaces as a non-zero child exit / missing result file rather than being silently
 * swallowed.
 *
 * @param fixtureOrName A built-in fixture name (e.g. `'graphql'`) or an {@link InstrumentationFixture}.
 * @param options.appDir The test app directory holding `dist/<variant>/main.*`. Defaults to `cwd`.
 */
export function assertBundlerInstrumentation(
  fixtureOrName: string | InstrumentationFixture,
  { appDir = process.cwd() }: { appDir?: string } = {},
): void {
  const fixture = typeof fixtureOrName === 'string' ? FIXTURES[fixtureOrName] : fixtureOrName;
  if (!fixture) {
    throw new Error(
      `Unknown instrumentation fixture "${fixtureOrName}". Known: ${Object.keys(FIXTURES).join(', ')}. ` +
        'Pass an InstrumentationFixture object to test a library without a built-in fixture.',
    );
  }
  const { moduleName, origin, sourceMarker, assertResult } = fixture;

  // Entry filename varies by output format (`.mjs` for ESM bundlers, `.cjs` for esbuild's CJS output).
  const entryPath = (name: string): string => {
    const dir = join(appDir, 'dist', name);
    const entry = ['main.mjs', 'main.cjs', 'main.js'].map(f => join(dir, f)).find(existsSync);
    if (!entry) {
      throw new Error(`no built entry (main.mjs/.cjs/.js) found in ${dir}`);
    }
    return entry;
  };

  // `withImport` preloads the SDK's runtime diagnostics-channel hook, so it transforms the library as
  // Node loads it — the mechanism used for external (unbundled) dependencies. The entry writes its
  // result to a file (not stdout) so a piped, buffered write can't be truncated by the child's exit.
  const runBundle = (name: string, withImport: boolean): BundleRun => {
    const resultFile = join(tmpdir(), `sentry-bundler-e2e-${name}-${randomUUID()}.json`);
    const args = withImport ? ['--import', '@sentry/node/import', entryPath(name)] : [entryPath(name)];
    const label = `${name}${withImport ? ' (--import)' : ''}`;
    let stdout: string;
    try {
      stdout = execFileSync(process.execPath, args, {
        encoding: 'utf8',
        cwd: appDir,
        env: { ...process.env, SENTRY_E2E_RESULT_FILE: resultFile },
      });
    } catch (error) {
      const err = error as { stdout?: string | null; stderr?: string | null };
      throw new Error(`${label} crashed before writing its result.\n${err.stdout ?? ''}${err.stderr ?? ''}`);
    }
    let raw: string;
    try {
      raw = readFileSync(resultFile, 'utf8');
    } catch {
      throw new Error(`${label} exited without writing a result file. Output:\n${stdout}`);
    } finally {
      rmSync(resultFile, { force: true });
    }
    return JSON.parse(raw) as BundleRun;
  };

  const spanCount = (run: BundleRun): number => run.spans.filter(s => s.origin === origin).length;

  let failed = false;
  const check = (condition: boolean, message: string): void => {
    // eslint-disable-next-line no-console
    console.log(`${condition ? 'ok  ' : 'FAIL'} - ${message}`);
    if (!condition) {
      failed = true;
    }
  };

  // Every emitted `.mjs`/`.cjs`/`.js` chunk in the variant's output dir, concatenated. Scans the whole
  // dir, not just the entry, because bundlers split dynamic imports (e.g. webpack turns the entry's
  // `await import('./app.mjs')` into a separate chunk) — so the library's source (inlined) or its bare
  // import (external) can land in a sibling chunk rather than `main.*`.
  const readBundle = (name: string): string =>
    readdirSync(join(appDir, 'dist', name), { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile() && JS_EXTENSIONS.some(ext => entry.name.endsWith(ext)))
      .map(entry => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
      .join('\n');

  // Guards the build config, not just its runtime output: the span assertions can pass by accident
  // when the externalization knob is a no-op (e.g. a Vite SSR build externalizes deps by default, so
  // a mis-set toggle silently ships an external library in every variant while the counts still come
  // out right). Assert the bundle SHAPE instead: an inlined build carries the library's own source
  // (its `sourceMarker`) and has no bare import left; an external build keeps the bare import/require
  // and never inlines that source.
  const assertBundleShape = (name: string, inlined: boolean): void => {
    const bundle = readBundle(name);
    const external = bundleReferencesModule(bundle, moduleName);
    const inlinedSource = bundle.includes(sourceMarker);
    if (inlined) {
      check(!external && inlinedSource, `${name}: ${moduleName} is inlined into the bundle`);
    } else {
      check(external && !inlinedSource, `${name}: ${moduleName} is kept external to the bundle`);
    }
  };

  const scenarios = {
    plain: runBundle('plain', false),
    plugin: runBundle('plugin', false),
    plainExternalImport: runBundle('plain-external', true),
    pluginExternalImport: runBundle('plugin-external', true),
  };

  for (const [label, run] of Object.entries(scenarios)) {
    check(assertResult(run.result), `${label}: ${moduleName} workload works`);
  }

  assertBundleShape('plain', true);
  assertBundleShape('plugin', true);
  assertBundleShape('plain-external', false);
  assertBundleShape('plugin-external', false);

  // One set of spans, established by the build-time run.
  const oneSet = spanCount(scenarios.plugin);
  check(oneSet > 0, `plugin build (build-time) emits a set of ${moduleName} spans`);
  check(spanCount(scenarios.plain) === 0, `plain build (no plugin, no --import) emits no ${moduleName} spans`);
  check(
    spanCount(scenarios.plainExternalImport) === oneSet,
    `external build + --import emits exactly one set of ${moduleName} spans (${oneSet}) via the runtime hook`,
  );
  check(
    spanCount(scenarios.pluginExternalImport) === oneSet,
    `external build + plugin + --import emits exactly one set of ${moduleName} spans (${oneSet}), not double`,
  );

  if (failed) {
    throw new Error(`${moduleName} bundler instrumentation assertions failed`);
  }
  // eslint-disable-next-line no-console
  console.log(`All ${moduleName} bundle assertions passed.`);
}
