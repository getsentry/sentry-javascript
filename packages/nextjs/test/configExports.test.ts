import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { init, parse } from 'cjs-module-lexer';
import { beforeAll, describe, expect, it } from 'vitest';

const nodeRequire = createRequire(import.meta.url);
const packageExports = (nodeRequire('../package.json') as { exports: Record<string, unknown> }).exports;

/**
 * `next.config.mjs` is loaded by a plain Node ESM loader, so build-time config code has to work there. The ESM
 * variant of it does not: `build/esm/config/**` relies on `__dirname` to resolve loader and template paths, which
 * is a `ReferenceError` in an ES module. So `./config` deliberately serves the CJS build to ESM importers too,
 * rather than splitting `import`/`require` like the runtime entries do.
 *
 * There is no dual-package hazard here because this code runs at build time only and holds no SDK state.
 *
 * Separating the two entry points is also what unblocks serving real ESM to Node consumers later — see
 * https://github.com/getsentry/sentry-javascript/issues/22791
 */
describe('`./config` subpath export', () => {
  const configExport = packageExports['./config'];

  it('resolves to the CJS build for every condition', () => {
    expect(configExport).toEqual({
      types: './build/types/config/index.d.ts',
      default: './build/cjs/config/index.js',
    });
  });

  it('never points a condition at the ESM config build', () => {
    expect(JSON.stringify(configExport)).not.toContain('build/esm');
  });
});

/**
 * ESM consumers of a CJS file only get the named exports `cjs-module-lexer` can see statically — anything it misses
 * links as `undefined`. So `withSentryConfig` has to stay statically detectable for `import { withSentryConfig } from
 * '@sentry/nextjs/config'` to work.
 *
 * Exercises the generated artifact, so it needs the package built.
 */
describe('`./config` static exports (generated)', () => {
  let staticExports: string[];

  beforeAll(async () => {
    await init();
    staticExports = parse(readFileSync(resolve(__dirname, '../build/cjs/config/index.js'), 'utf8')).exports;
  });

  it('statically exports `withSentryConfig`', () => {
    expect(staticExports).toContain('withSentryConfig');
  });
});

/**
 * The `node` condition can only ever serve ESM if the server runtime entry stays free of build-time config code, so
 * guard that here even though `node` still resolves to CommonJS today. A plain `__dirname` reference is the tripwire:
 * it survives bundling, only throws once the enclosing function runs (so merely importing the entry would not catch
 * it), and every known offender in `src/config` uses one.
 *
 * Exercises the generated artifact, so it needs the package built.
 */
describe('ESM server build is loadable under a plain Node loader (generated)', () => {
  const entry = resolve(__dirname, '../build/esm/index.server.js');

  /** Every file reachable from `entry` via relative specifiers — i.e. this package's own ESM output. */
  function collectModuleGraph(from: string, seen = new Set<string>()): Set<string> {
    if (seen.has(from)) {
      return seen;
    }
    seen.add(from);

    const source = readFileSync(from, 'utf8');
    for (const [, specifier] of source.matchAll(/from\s*'(\.[^']+)'|import\s*'(\.[^']+)'/g)) {
      if (specifier) {
        collectModuleGraph(resolve(dirname(from), specifier), seen);
      }
    }

    return seen;
  }

  it('reaches no module that references `__dirname`', () => {
    const offenders = [...collectModuleGraph(entry)].filter(file =>
      /(^|[^.\w])__dirname([^\w]|$)/.test(readFileSync(file, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });

  // Catches what the `__dirname` scan cannot: extensionless bare specifiers and require-cycles, which fail at link
  // time rather than when some function runs. Needs a real Node loader, hence the child process.
  it('imports cleanly, with the full namespace and without `withSentryConfig`', () => {
    const script = `
      import * as Sentry from ${JSON.stringify(entry)};

      const missing = ['init', 'captureException', 'captureMessage', 'setTag', 'addBreadcrumb', 'isEnabled']
        .filter(name => typeof Sentry[name] !== 'function');
      if (missing.length) {
        throw new Error('missing exports: ' + missing.join(', '));
      }

      // Build-time only — it lives on \`@sentry/nextjs/config\` and must stay out of the runtime graph.
      if ('withSentryConfig' in Sentry) {
        throw new Error('the runtime entry still exports withSentryConfig');
      }
    `;

    expect(() =>
      execFileSync(process.execPath, ['--input-type=module', '-e', script], { stdio: 'pipe' }),
    ).not.toThrow();
  });
});
