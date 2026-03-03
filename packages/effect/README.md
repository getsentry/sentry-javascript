# Sentry Effect SDK

[![npm version](https://img.shields.io/npm/v/@sentry/effect.svg)](https://www.npmjs.com/package/@sentry/effect)
[![npm dm](https://img.shields.io/npm/dm/@sentry/effect.svg)](https://www.npmjs.com/package/@sentry/effect)
[![npm dt](https://img.shields.io/npm/dt/@sentry/effect.svg)](https://www.npmjs.com/package/@sentry/effect)

## Links

- [Official SDK Docs](https://docs.sentry.io/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## General

This package is a Sentry SDK for [Effect](https://effect.website/).

## Installation

```bash
npm install @sentry/effect
# or
yarn add @sentry/effect
# or
pnpm add @sentry/effect
```

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
      enableMetrics: true,
    }),
  ),
);

MainLive.pipe(Layer.launch, NodeRuntime.runMain);
```

The `effectLayer` function initializes Sentry and returns an Effect Layer that provides:

- Distributed tracing with automatic HTTP header extraction/injection
- Effect spans traced as Sentry spans
- Effect logs forwarded to Sentry (when `enableLogs` is set)
- Effect metrics sent to Sentry (when `enableMetrics` is set)
