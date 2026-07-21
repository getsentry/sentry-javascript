// Builds the smoke scenario with the orchestrion `bun build` plugin and writes
// the bundle to a temp dir, printing the output path for test.ts to execute.
//
// A successful build proves `bun build` runs with the plugin; running the bundle
// (see test.ts) then proves the bundled `mysql` is actually instrumented.

// @ts-ignore -- subpath export resolved by Bun at runtime; the package
// tsconfig's node module resolution can't see `exports` subpaths.
import { sentryBunPlugin } from '@sentry/bun/plugin';
import { tmpdir } from 'os';
import { join } from 'path';

void (async () => {
  const outdir = join(tmpdir(), `sentry-bun-orchestrion-${process.pid}-${Date.now()}`);
  const result = await Bun.build({
    entrypoints: [join(__dirname, 'scenario.ts')],
    target: 'bun',
    outdir,
    // Deliberately mark `mysql` external. An externalized dependency is resolved
    // from `node_modules` at runtime and never passes through the transform's
    // `onLoad`, so its channel injection would be silently skipped. The plugin
    // must strip instrumented packages back out of `external` so they get
    // bundled (and thus transformed).
    external: ['mysql'],
    plugins: [sentryBunPlugin()],
  });

  if (!result.success) {
    // eslint-disable-next-line no-console
    console.error('BUILD_FAILED', result.logs);
    process.exit(1);
  }

  const output = result.outputs[0];
  if (!output) {
    // eslint-disable-next-line no-console
    console.error('BUILD_FAILED no outputs');
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(`BUILD_OK outfile=${output.path}`);
})();
