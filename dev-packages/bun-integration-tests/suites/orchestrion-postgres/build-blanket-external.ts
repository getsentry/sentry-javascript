// Builds the scenario with a blanket externalization strategy
// (`packages: 'external'`), which the plugin cannot strip. It must warn (to
// stderr) that instrumented packages will ship un-transformed. Guards the
// regression covered in test.ts; the built output is never run.

// @ts-ignore -- subpath export resolved by Bun at runtime; the package
// tsconfig's node module resolution can't see `exports` subpaths.
import { sentryBunPlugin } from '@sentry/bun/plugin';
import { tmpdir } from 'os';
import { join } from 'path';

void (async () => {
  const outdir = join(tmpdir(), `sentry-bun-orchestrion-pg-blanket-${process.pid}-${Date.now()}`);
  const result = await Bun.build({
    entrypoints: [join(__dirname, 'scenario.ts')],
    target: 'bun',
    outdir,
    // Externalize every dependency. Unlike an explicit `external: ['pg']`, the
    // plugin cannot un-externalize this, so it should warn instead of silently
    // shipping an un-instrumented `pg`.
    packages: 'external',
    plugins: [sentryBunPlugin()],
  });

  // eslint-disable-next-line no-console
  console.log(result.success ? 'BUILD_OK' : 'BUILD_FAILED');
})();
