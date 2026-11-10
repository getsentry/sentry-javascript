// Same four-way esbuild matrix as the `node-esbuild` app, but with the plugin imported from
// `@sentry/aws-serverless/esbuild`, which is how a Lambda project that bundles with esbuild (CDK,
// SAM, Serverless Framework) would use it. See `node-esbuild/build.mjs` for the variant layout.
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { sentryEsbuildPlugin } from '@sentry/aws-serverless/esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));

rmSync(join(__dirname, 'dist'), { recursive: true, force: true });

// No auth/release/telemetry — we only care about the build-time transforms and defines.
const makeSentryPlugin = () =>
  sentryEsbuildPlugin({
    telemetry: false,
    sourcemaps: { disable: true },
    release: { create: false, finalize: false, inject: false },
  });

function run(name, { external, plugins }) {
  return build({
    entryPoints: [join(__dirname, 'src', 'entry.mjs')],
    outfile: join(__dirname, 'dist', name, 'main.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: external ? ['graphql'] : [],
    minify: false,
    logLevel: 'silent',
    plugins,
  });
}

await run('plain', { external: false, plugins: [] });
await run('plugin', { external: false, plugins: [makeSentryPlugin()] });
await run('plain-external', { external: true, plugins: [] });
await run('plugin-external', { external: true, plugins: [makeSentryPlugin()] });

// eslint-disable-next-line no-console
console.log('built plain + plugin (inlined) and plain-external + plugin-external with esbuild');
