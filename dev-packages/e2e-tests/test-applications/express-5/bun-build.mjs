// Bundles the app with `@sentry/bun/plugin`. Under `bun run` the SDK cannot inject diagnostics channels into
// packages, so only a bundled app gets the Express and MySQL spans.
import { sentryBunPlugin } from '@sentry/bun/plugin';
import { join } from 'node:path';

await Bun.build({
  entrypoints: [join(import.meta.dir, 'src/main.ts')],
  target: 'bun',
  outdir: join(import.meta.dir, 'dist-bun'),
  plugins: [sentryBunPlugin({ telemetry: false })],
});
