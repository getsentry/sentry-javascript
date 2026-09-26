// @ts-ignore -- subpath export resolved by Bun at runtime; the package
// tsconfig's node module resolution can't see `exports` subpaths.
import { sentryBunPlugin } from '@sentry/bun/plugin';
import { join } from 'path';

void (async () => {
  const result = await Bun.build({
    entrypoints: [join(__dirname, 'src/app.ts')],
    target: 'bun',
    outdir: join(__dirname, 'dist'),
    external: ['@sentry/bun', 'express'],
    plugins: [sentryBunPlugin()],
  });

  if (!result.success) {
    // oxlint-disable-next-line no-console
    console.error('BUILD_FAILED', result.logs);
    process.exit(1);
  }
})();
