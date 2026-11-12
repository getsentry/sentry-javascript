// Bundles the `nest build` output with `@sentry/bun/plugin`. Under `bun run` the SDK cannot inject
// diagnostics channels into packages, so only a bundled app gets the Nest and Express spans.
import { sentryBunPlugin } from '@sentry/bun/plugin';
import { join } from 'node:path';

await Bun.build({
  entrypoints: [join(import.meta.dir, 'dist/main.js')],
  target: 'bun',
  outdir: join(import.meta.dir, 'dist-bun'),
  // The bundler resolves Nest's optional `require` calls at build time. `@nestjs/websockets`,
  // `class-transformer`, `class-validator` and `cache-manager` are not installed. `@nestjs/microservices`
  // is installed for `RpcException`, but it loads transports (`kafkajs`, `@grpc/grpc-js`, ...) that are not.
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
