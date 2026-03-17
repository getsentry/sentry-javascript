# Official Sentry SDK for Effect.ts (Alpha)

[![npm version](https://img.shields.io/npm/v/@sentry/effect.svg)](https://www.npmjs.com/package/@sentry/effect)
[![npm dm](https://img.shields.io/npm/dm/@sentry/effect.svg)](https://www.npmjs.com/package/@sentry/effect)
[![npm dt](https://img.shields.io/npm/dt/@sentry/effect.svg)](https://www.npmjs.com/package/@sentry/effect)

> NOTICE: This package is in alpha state and may be subject to breaking changes.

## Getting Started

This SDK does not have docs yet. Stay tuned.

## Usage

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

The `effectLayer` function initializes Sentry. To enable Effect instrumentation, compose with:

- `Layer.setTracer(Sentry.SentryEffectTracer)` - Effect spans traced as Sentry spans
- `Logger.replace(Logger.defaultLogger, Sentry.SentryEffectLogger)` - Effect logs forwarded to Sentry
- `Sentry.SentryEffectMetricsLayer` - Effect metrics sent to Sentry

## Links

<!-- - [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/effect/) -->

- [Sentry.io](https://sentry.io/?utm_source=github&utm_medium=npm_effect)
- [Sentry Discord Server](https://discord.gg/Ww9hbqr)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/sentry)
