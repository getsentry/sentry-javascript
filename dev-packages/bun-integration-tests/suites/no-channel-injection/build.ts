// Builds `app.ts` with `@sentry/bun/plugin` and prints the path of the output file. The test runs
// that file with `instrument.ts` preloaded, so the SDK starts before the built app loads.
import { sentryBunPlugin } from '@sentry/bun/plugin';
import { join } from 'node:path';

const result = await Bun.build({
  entrypoints: [join(import.meta.dir, 'app.ts')],
  target: 'bun',
  outdir: join(import.meta.dir, '..', '..', 'build', 'no-channel-injection'),
  // The preloaded instrument file is not bundled, so the app must use the same `@sentry/*` packages.
  external: ['@sentry/*'],
  plugins: [sentryBunPlugin()],
});

const output = result.outputs.find(file => file.kind === 'entry-point');
if (!result.success || !output) {
  // eslint-disable-next-line no-console
  console.error('BUILD_FAILED', result.logs);
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log(`BUILD_OK ${output.path}`);
