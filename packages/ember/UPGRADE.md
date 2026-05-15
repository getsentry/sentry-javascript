# Upgrading @sentry/ember from v1 to v2

This guide covers migrating from the v1 Ember addon format to the v2 addon format.

## Overview of Changes

The v2 addon is a modern [Ember v2 addon](https://rfcs.emberjs.com/id/0507-embroider-v2-package-format/) that works with Embroider and Vite. Key differences:

| Feature | v1 Addon | v2 Addon |
|---------|----------|----------|
| Configuration | `config/environment.js` | Direct `Sentry.init()` call |
| Performance instrumentation | Auto-registered initializer | Manual instance-initializer with `browserTracingIntegration` |
| Build compatibility | Classic builds only | Embroider & Vite compatible |

## Step 1: Update Configuration

### Before (v1)

```javascript
// config/environment.js
module.exports = function (environment) {
  const ENV = {
    // ...
    '@sentry/ember': {
      sentry: {
        dsn: 'YOUR_DSN_HERE',
        tracesSampleRate: 1.0,
        // ...
      },
      disablePerformance: false,
      disableRunloopPerformance: false,
      disableInstrumentComponents: false,
      disableInitialLoadInstrumentation: false,
    },
  };
  return ENV;
};
```

### After (v2)

```typescript
// app/app.ts (or app/app.js)
import Application from '@ember/application';
import Resolver from 'ember-resolver';
import loadInitializers from 'ember-load-initializers';
import config from 'your-app/config/environment';
import * as Sentry from '@sentry/ember';

// Initialize Sentry BEFORE the Application class
Sentry.init({
  dsn: 'YOUR_DSN_HERE',
  tracesSampleRate: 1.0,
  // All Sentry browser options are supported
});

export default class App extends Application {
  modulePrefix = config.modulePrefix;
  podModulePrefix = config.podModulePrefix;
  Resolver = Resolver;
}

loadInitializers(App, config.modulePrefix);
```

Remove the `@sentry/ember` section from `config/environment.js`.

## Step 2: Set Up Performance Instrumentation (Optional)

In v1, performance instrumentation was automatic. In v2, create an instance-initializer.

### Create `app/instance-initializers/sentry-performance.ts`

```typescript
import type ApplicationInstance from '@ember/application/instance';
import { addIntegration, browserTracingIntegration } from '@sentry/ember';

export function initialize(appInstance: ApplicationInstance): void {
  addIntegration(browserTracingIntegration({ appInstance }));
}

export default {
  initialize,
};
```

### With Options

```typescript
import type ApplicationInstance from '@ember/application/instance';
import { addIntegration, browserTracingIntegration } from '@sentry/ember';

export function initialize(appInstance: ApplicationInstance): void {
  addIntegration(browserTracingIntegration({
    appInstance,

    // Disable runloop queue tracking
    disableRunloopPerformance: false,

    // Disable component render tracking
    disableInstrumentComponents: false,

    // Track component class definitions (advanced)
    enableComponentDefinitions: false,

    // Minimum duration (ms) for runloop spans
    minimumRunloopQueueDuration: 5,

    // Minimum duration (ms) for component render spans
    minimumComponentRenderDuration: 2,

    // Page load and navigation instrumentation
    instrumentPageLoad: true,
    instrumentNavigation: true,

    // Idle timeout (ms)
    idleTimeout: 5000,
  }));
}

export default {
  initialize,
};
```

## Step 3: Route Performance Instrumentation

This works the same in v1 and v2:

```typescript
// app/routes/my-route.ts
import Route from '@ember/routing/route';
import { instrumentRoutePerformance } from '@sentry/ember';

class MyRoute extends Route {
  async model() {
    return this.store.findAll('post');
  }
}

export default instrumentRoutePerformance(MyRoute);
```

## Step 4: Update Imports

Most imports remain the same, but check for these changes:

### Performance Module

```typescript
// v2 - new import for browserTracingIntegration
import { addIntegration, browserTracingIntegration } from '@sentry/ember';

// v2 - same for instrumentRoutePerformance
import { instrumentRoutePerformance } from '@sentry/ember';
```

### All @sentry/browser Exports

All exports from `@sentry/browser` are re-exported from `@sentry/ember`:

```typescript
import {
  // Core
  init,
  captureException,
  captureMessage,
  setUser,
  setTag,
  setExtra,
  addBreadcrumb,
  withScope,

  // Spans
  startSpan,
  startInactiveSpan,
  getActiveSpan,

  // Ember-specific
  browserTracingIntegration,
  instrumentRoutePerformance,
} from '@sentry/ember';
```

## Complete Migration Example

### Before (v1)

```
app/
├── app.js
├── index.html (unmodified)
├── routes/
│   └── posts.js
config/
└── environment.js (with @sentry/ember config)
```

**app/app.js:**
```javascript
import Application from '@ember/application';
// Sentry was auto-initialized from config
```

**config/environment.js:**
```javascript
module.exports = function (environment) {
  return {
    '@sentry/ember': {
      sentry: {
        dsn: 'YOUR_DSN',
        tracesSampleRate: 1.0,
      },
    },
  };
};
```

### After (v2)

```
app/
├── app.ts
├── instance-initializers/
│   └── sentry-performance.ts
├── routes/
│   └── posts.ts
config/
└── environment.js (no @sentry/ember config)
```

**app/app.ts:**
```typescript
import Application from '@ember/application';
import Resolver from 'ember-resolver';
import loadInitializers from 'ember-load-initializers';
import config from 'my-app/config/environment';
import * as Sentry from '@sentry/ember';

Sentry.init({
  dsn: 'YOUR_DSN',
  tracesSampleRate: 1.0,
});

export default class App extends Application {
  modulePrefix = config.modulePrefix;
  podModulePrefix = config.podModulePrefix;
  Resolver = Resolver;
}

loadInitializers(App, config.modulePrefix);
```

**app/instance-initializers/sentry-performance.ts:**
```typescript
import type ApplicationInstance from '@ember/application/instance';
import { addIntegration, browserTracingIntegration } from '@sentry/ember';

export function initialize(appInstance: ApplicationInstance): void {
  addIntegration(browserTracingIntegration({ appInstance }));
}

export default { initialize };
```

## Troubleshooting

### "Cannot find module '@sentry/ember/performance'"

Make sure you're importing from the correct path:
```typescript
import { browserTracingIntegration } from '@sentry/ember';
```

### Performance spans not appearing

1. Ensure `Sentry.init()` is called before app boots
2. Verify the instance-initializer is created at `app/instance-initializers/sentry-performance.ts`
3. Check that `tracesSampleRate` is set (e.g., `1.0` for 100%)

### FastBoot / SSR

The performance instrumentation automatically detects FastBoot and disables client-side instrumentation during server rendering. No changes needed.

## Removed Features

The following v1-specific features are no longer available:

1. **`contentFor` hooks** - The addon no longer injects scripts automatically
2. **`@embroider/macros` config** - Use direct `init()` options
3. **Initial load scripts** - No longer needed; page load instrumentation is handled by `browserTracingIntegration`

## Questions?

- [Sentry Ember Documentation](https://docs.sentry.io/platforms/javascript/guides/ember/)
- [GitHub Issues](https://github.com/getsentry/sentry-javascript/issues)
