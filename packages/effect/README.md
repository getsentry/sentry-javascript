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
import { Layer } from 'effect';
import { HttpLive } from './Http.js';

const MainLive = HttpLive.pipe(
  Layer.provide(
    Sentry.effectLayer({
      dsn: '__DSN__',
      enableLogs: true,
      enableEffectLogs: true,
      enableEffectMetrics: true,
    }),
  ),
);

MainLive.pipe(Layer.launch, NodeRuntime.runMain);
```

The `effectLayer` function initializes Sentry and returns an Effect Layer that provides:

- Distributed tracing with automatic HTTP header extraction/injection
- Effect spans traced as Sentry spans
- Effect logs forwarded to Sentry (when `enableEffectLogs` is set)
- Effect metrics sent to Sentry (when `enableEffectMetrics` is set)

## Links

<!-- - [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/effect/) -->

- [Sentry.io](https://sentry.io/?utm_source=github&utm_medium=npm_effect)
- [Sentry Discord Server](https://discord.gg/Ww9hbqr)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/sentry)
