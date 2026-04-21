# Official Sentry SDK for Effect.ts (Alpha)

[![npm version](https://img.shields.io/npm/v/@sentry/effect.svg)](https://www.npmjs.com/package/@sentry/effect)
[![npm dm](https://img.shields.io/npm/dm/@sentry/effect.svg)](https://www.npmjs.com/package/@sentry/effect)
[![npm dt](https://img.shields.io/npm/dt/@sentry/effect.svg)](https://www.npmjs.com/package/@sentry/effect)

> NOTICE: This package is in alpha state and may be subject to breaking changes.

`@sentry/effect` supports both Effect v3 and Effect v4 (beta). The integration
auto-detects the installed Effect version at runtime, but the layer composition
APIs differ between the two major versions, so the setup code is slightly
different.

## Getting Started

This SDK does not have docs yet. Stay tuned.

## Usage with Effect v3

```typescript
import * as Sentry from '@sentry/effect/server';
import { NodeRuntime } from '@effect/platform-node';
import { Layer, Logger } from 'effect';
import { HttpLive } from './Http.js';

const SentryLive = Layer.mergeAll(
  Sentry.effectLayer({
    dsn: '__DSN__',
    tracesSampleRate: 1.0,
    enableLogs: true,
  }),
  Layer.setTracer(Sentry.SentryEffectTracer),
  Logger.replace(Logger.defaultLogger, Sentry.SentryEffectLogger),
  Sentry.SentryEffectMetricsLayer,
);

const MainLive = HttpLive.pipe(Layer.provide(SentryLive));
MainLive.pipe(Layer.launch, NodeRuntime.runMain);
```

## Usage with Effect v4

Effect v4 reorganized the `Tracer` and `Logger` layer APIs, so the wiring looks
slightly different. The `effectLayer`, `SentryEffectTracer`,
`SentryEffectLogger`, and `SentryEffectMetricsLayer` exports themselves are the
same.

```typescript
import * as Sentry from '@sentry/effect/server';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import * as Layer from 'effect/Layer';
import * as Logger from 'effect/Logger';
import * as Tracer from 'effect/Tracer';
import { HttpRouter } from 'effect/unstable/http';
import { createServer } from 'http';
import { Routes } from './Routes.js';

const SentryLive = Layer.mergeAll(
  Sentry.effectLayer({
    dsn: '__DSN__',
    tracesSampleRate: 1.0,
    enableLogs: true,
  }),
  Layer.succeed(Tracer.Tracer, Sentry.SentryEffectTracer),
  Logger.layer([Sentry.SentryEffectLogger]),
  Sentry.SentryEffectMetricsLayer,
);

const HttpLive = HttpRouter.serve(Routes).pipe(
  Layer.provide(NodeHttpServer.layer(() => createServer(), { port: 3030 })),
  Layer.provide(SentryLive),
);

NodeRuntime.runMain(Layer.launch(HttpLive));
```

## Links

- [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/effect/)
- [Sentry.io](https://sentry.io/?utm_source=github&utm_medium=npm_effect)
- [Sentry Discord Server](https://discord.gg/Ww9hbqr)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/sentry)
