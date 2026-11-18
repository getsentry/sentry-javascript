import { join } from 'node:path';
import { build } from 'esbuild';

// esbuild emits CJS (not ESM): its ESM output can't perform the CJS `require('node:async_hooks')` that
// `@sentry/server-utils` does once inlined, and CJS is the normal esbuild node target.
export function bundle({ entry, outDir, external, plugins }) {
  return build({
    entryPoints: [entry],
    outfile: join(outDir, 'main.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: external ? ['graphql'] : [],
    minify: false,
    logLevel: 'silent',
    plugins,
  });
}
