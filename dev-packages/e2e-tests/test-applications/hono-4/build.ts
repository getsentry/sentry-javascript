// Builds `src/entry.bun.ts` with the orchestrion `bun build` plugin, emitting `dist/entry.bun.js`
// for the server to run. The plugin injects the `orchestrion:hono:honoConstructor` diagnostics
// channel into the bundled `hono`, which the `honoIntegration` default subscribes to.

// @ts-ignore -- subpath export resolved by Bun at runtime; the package tsconfig's node module
// resolution can't see `exports` subpaths.
import { sentryBunPlugin } from '@sentry/bun/plugin';
import { join } from 'path';

void (async () => {
  const result = await Bun.build({
    entrypoints: [join(__dirname, 'src/entry.bun.ts')],
    target: 'bun',
    outdir: join(__dirname, 'dist'),
    // `@sentry/bun` (and its deps) stay external, so we don't bundle the whole SDK/OTel stack.
    // `hono` is also listed, but the plugin strips instrumented packages back out of `external` so
    // it gets bundled and transformed (channel injection only happens on code that passes through
    // the bundler).
    external: ['@sentry/bun', 'hono'],
    plugins: [sentryBunPlugin()],
  });

  if (!result.success) {
    // eslint-disable-next-line no-console
    console.error('BUILD_FAILED', result.logs);
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log('BUILD_OK');
})();
