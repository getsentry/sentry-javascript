<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Ember.js

[![npm version](https://img.shields.io/npm/v/@sentry/ember.svg)](https://www.npmjs.com/package/@sentry/ember)
[![npm dm](https://img.shields.io/npm/dm/@sentry/ember.svg)](https://www.npmjs.com/package/@sentry/ember)
[![npm dt](https://img.shields.io/npm/dt/@sentry/ember.svg)](https://www.npmjs.com/package/@sentry/ember)

This SDK is a v2 Ember addon that provides error tracking and performance monitoring for Ember.js applications.

## Requirements

- Ember.js 4.0+
- Node.js 18+

## Installation

```bash
npm install @sentry/ember
# or
yarn add @sentry/ember
# or
pnpm add @sentry/ember
```

## Basic Setup

Initialize Sentry early in your application, typically in `app/app.ts` or `app/app.js`:

```typescript
import Application from '@ember/application';
import Resolver from 'ember-resolver';
import loadInitializers from 'ember-load-initializers';
import config from 'my-app/config/environment';
import * as Sentry from '@sentry/ember';

// Initialize Sentry before the application
Sentry.init({
  dsn: '__YOUR_DSN__',
  // Set tracesSampleRate to 1.0 to capture 100% of transactions for tracing.
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,
});

export default class App extends Application {
  modulePrefix = config.modulePrefix;
  podModulePrefix = config.podModulePrefix;
  Resolver = Resolver;
}

loadInitializers(App, config.modulePrefix);
```

## Performance Monitoring

For automatic performance instrumentation (page loads, navigation, runloop, components), create an instance-initializer:

```typescript
// app/instance-initializers/sentry-performance.ts
import type ApplicationInstance from '@ember/application/instance';
import { setupPerformance } from '@sentry/ember';

export function initialize(appInstance: ApplicationInstance): void {
  setupPerformance(appInstance, {
    // Optional configuration
    transitionTimeout: 5000,
    minimumRunloopQueueDuration: 5,
    minimumComponentRenderDuration: 2,
  });
}

export default {
  initialize,
};
```

### Performance Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `disablePerformance` | `boolean` | `false` | Disable all performance instrumentation |
| `disableRunloopPerformance` | `boolean` | `false` | Disable runloop queue tracking |
| `disableInstrumentComponents` | `boolean` | `false` | Disable component render tracking |
| `disableInitialLoadInstrumentation` | `boolean` | `false` | Disable initial page load instrumentation |
| `enableComponentDefinitions` | `boolean` | `false` | Enable component definition tracking |
| `minimumRunloopQueueDuration` | `number` | `5` | Minimum duration (ms) for runloop spans |
| `minimumComponentRenderDuration` | `number` | `2` | Minimum duration (ms) for component spans |
| `transitionTimeout` | `number` | `5000` | Timeout (ms) for navigation transitions |
| `browserTracingOptions` | `object` | `{}` | Options for browserTracingIntegration |

### Route Performance Instrumentation

To instrument individual routes with detailed lifecycle tracking, use the `instrumentRoutePerformance` decorator:

```typescript
// app/routes/application.ts
import Route from '@ember/routing/route';
import { instrumentRoutePerformance } from '@sentry/ember';

class ApplicationRoute extends Route {
  async model() {
    return this.store.findAll('post');
  }
}

export default instrumentRoutePerformance(ApplicationRoute);
```

This wraps the route's `beforeModel`, `model`, `afterModel`, and `setupController` hooks with Sentry spans.

## Initial Load Instrumentation

To capture the initial page load time, add these performance marks to your `index.html`:

```html
<!DOCTYPE html>
<html>
  <head>
    <!-- Add at start of head -->
    <script>if(window.performance&&window.performance.mark){window.performance.mark('@sentry/ember:initial-load-start');}</script>
    <!-- ... other head content ... -->
  </head>
  <body>
    <!-- ... body content ... -->
    <!-- Add at end of body -->
    <script>if(window.performance&&window.performance.mark){window.performance.mark('@sentry/ember:initial-load-end');}</script>
  </body>
</html>
```

> **CSP note:** If using Content Security Policy, add the SHA-256 hashes to your `script-src` directive.
> You can import `INITIAL_LOAD_HEAD_SCRIPT_HASH` and `INITIAL_LOAD_BODY_SCRIPT_HASH` from `@sentry/ember`.

## API

This package re-exports everything from `@sentry/browser`, so you have access to the full Sentry Browser SDK API:

```typescript
import * as Sentry from '@sentry/ember';

// Capture an error
Sentry.captureException(new Error('Something went wrong'));

// Capture a message
Sentry.captureMessage('Something happened');

// Set user context
Sentry.setUser({ id: '123', email: 'user@example.com' });

// Add breadcrumb
Sentry.addBreadcrumb({
  category: 'ui.click',
  message: 'User clicked button',
  level: 'info',
});

// Create a span
Sentry.startSpan({ name: 'my-operation', op: 'task' }, () => {
  // ... do work
});
```

## Migration from v1 Addon

If you're upgrading from an older version of `@sentry/ember` (v1 addon format), here are the key changes:

### What Changed

1. **No automatic instance initializer**: You must now explicitly set up performance instrumentation by creating an instance-initializer and calling `setupPerformance()`.

2. **No `contentFor` hooks**: The addon no longer injects scripts via `contentFor`. Add the performance marks to your `index.html` manually if you want initial load instrumentation.

3. **No environment config via `ENV['@sentry/ember']`**: Configure Sentry directly via `Sentry.init()` in your app.ts.

4. **Simpler dependency tree**: The v2 addon format has fewer dependencies and works better with modern build tools like Vite and Embroider.

### Migration Steps

1. Update your `app/app.ts` to call `Sentry.init()` directly with your configuration.

2. Create `app/instance-initializers/sentry-performance.ts` to set up performance monitoring.

3. Add the performance mark scripts to your `index.html` if you want initial load tracking.

4. Remove any `@sentry/ember` configuration from `config/environment.js`.

## Links

- [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/ember/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## License

MIT
