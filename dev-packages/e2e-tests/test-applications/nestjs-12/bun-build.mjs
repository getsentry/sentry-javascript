// Bundles the `nest build` output with `@sentry/bun/plugin`. Under `bun run` the SDK cannot inject
// diagnostics channels into packages, so only a bundled app gets the Nest and Express spans.
import { sentryBunPlugin } from '@sentry/bun/plugin';
import { join } from 'node:path';

await Bun.build({
  entrypoints: [join(import.meta.dir, 'dist/main.js')],
  target: 'bun',
  outdir: join(import.meta.dir, 'dist-bun'),
  // Nest loads these optional packages only when they are installed, but the bundler resolves the
  // `require` calls at build time. The app uses `@nestjs/microservices` only for `RpcException`.
  external: [
    '@nestjs/microservices',
    '@nestjs/microservices/*',
    '@nestjs/websockets',
    '@nestjs/websockets/*',
    'class-transformer',
    'class-validator',
    'cache-manager',
  ],
  plugins: [sentryBunPlugin({ telemetry: false })],
});
