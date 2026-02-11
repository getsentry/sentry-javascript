# Upgrading @sentry/ember from v1 to v2

This guide covers migrating from the v1 Ember addon format to the v2 addon format.

## Overview of Changes

The v2 addon is a modern [Ember v2 addon](https://rfcs.emberjs.com/id/0507-embroider-v2-package-format/) that works with Embroider and Vite. Key differences:

| Feature | v1 Addon | v2 Addon |
|---------|----------|----------|
| Configuration | `config/environment.js` | Direct `Sentry.init()` call |
| Performance scripts | Auto-injected via `contentFor` | Manual addition to `index.html` |
| Performance instrumentation | Auto-registered initializer | Manual instance-initializer |
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

## Step 2: Add Initial Load Scripts (Optional)

For accurate page load performance measurement, the v1 addon auto-injected performance mark scripts. In v2, add these manually.

### Edit `app/index.html`

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>YourApp</title>

    <!-- Add this script at the START of <head> -->
    <script>if(window.performance&&window.performance.mark){window.performance.mark('@sentry/ember:initial-load-start');}</script>

    {{content-for "head"}}
    <link integrity="" rel="stylesheet" href="{{rootURL}}assets/vendor.css">
    <link integrity="" rel="stylesheet" href="{{rootURL}}assets/your-app.css">
    {{content-for "head-footer"}}
  </head>
  <body>
    {{content-for "body"}}

    <script src="{{rootURL}}assets/vendor.js"></script>
    <script src="{{rootURL}}assets/your-app.js"></script>

    <!-- Add this script at the END of <body> -->
    <script>if(window.performance&&window.performance.mark){window.performance.mark('@sentry/ember:initial-load-end');}</script>

    {{content-for "body-footer"}}
  </body>
</html>
```

### CSP (Content Security Policy)

If you use CSP, add these SHA-256 hashes to your `script-src` directive:

```
script-src 'sha256-rK59cvsWB8z8eOLy4JAib4tBp8c/beXTnlIRV+lYjhg=' 'sha256-jax2B81eAvYZMwpds3uZwJJOraCENeDFUJKuNJau/bg=' ...;
```

Or import the constants for programmatic use:

```typescript
import {
  INITIAL_LOAD_HEAD_SCRIPT_HASH,
  INITIAL_LOAD_BODY_SCRIPT_HASH,
} from '@sentry/ember';
```

## Step 3: Set Up Performance Instrumentation (Optional)

In v1, performance instrumentation was automatic. In v2, create an instance-initializer.

### Create `app/instance-initializers/sentry-performance.ts`

```typescript
import type ApplicationInstance from '@ember/application/instance';
import { setupPerformance } from '@sentry/ember';

export function initialize(appInstance: ApplicationInstance): void {
  setupPerformance(appInstance);
}

export default {
  initialize,
};
```

### With Options

```typescript
import type ApplicationInstance from '@ember/application/instance';
import { setupPerformance } from '@sentry/ember';

export function initialize(appInstance: ApplicationInstance): void {
  setupPerformance(appInstance, {
    // Disable runloop queue tracking
    disableRunloopPerformance: false,

    // Disable component render tracking
    disableInstrumentComponents: false,

    // Disable initial page load span
    disableInitialLoadInstrumentation: false,

    // Track component class definitions (advanced)
    enableComponentDefinitions: false,

    // Minimum duration (ms) for runloop spans
    minimumRunloopQueueDuration: 5,

    // Minimum duration (ms) for component render spans
    minimumComponentRenderDuration: 2,

    // Navigation transition timeout (ms)
    transitionTimeout: 5000,

    // Browser tracing options
    browserTracingOptions: {
      instrumentPageLoad: true,
      instrumentNavigation: true,
    },
  });
}

export default {
  initialize,
};
```

## Step 4: Route Performance Instrumentation

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

## Step 5: Update Imports

Most imports remain the same, but check for these changes:

### Performance Module

```typescript
// v1
import { instrumentRoutePerformance } from '@sentry/ember';

// v2 - same for instrumentRoutePerformance
import { instrumentRoutePerformance } from '@sentry/ember';

// v2 - new import for setupPerformance
import { setupPerformance } from '@sentry/ember';
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
  instrumentRoutePerformance,
  INITIAL_LOAD_HEAD_SCRIPT,
  INITIAL_LOAD_BODY_SCRIPT,
  INITIAL_LOAD_HEAD_SCRIPT_HASH,
  INITIAL_LOAD_BODY_SCRIPT_HASH,
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
├── index.html (with performance scripts)
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
import { setupPerformance } from '@sentry/ember';

export function initialize(appInstance: ApplicationInstance): void {
  setupPerformance(appInstance);
}

export default { initialize };
```

**app/index.html:**
```html
<!DOCTYPE html>
<html>
  <head>
    <script>if(window.performance&&window.performance.mark){window.performance.mark('@sentry/ember:initial-load-start');}</script>
    <!-- ... rest of head ... -->
  </head>
  <body>
    {{content-for "body"}}
    <script src="{{rootURL}}assets/vendor.js"></script>
    <script src="{{rootURL}}assets/my-app.js"></script>
    <script>if(window.performance&&window.performance.mark){window.performance.mark('@sentry/ember:initial-load-end');}</script>
  </body>
</html>
```

## Troubleshooting

### "Cannot find module '@sentry/ember/performance'"

Make sure you're importing from the correct path:
```typescript
import { setupPerformance } from '@sentry/ember';
```

### Performance spans not appearing

1. Ensure `Sentry.init()` is called before app boots
2. Verify the instance-initializer is created at `app/instance-initializers/sentry-performance.ts`
3. Check that `tracesSampleRate` is set (e.g., `1.0` for 100%)

### Initial load spans missing or inaccurate

Ensure the performance mark scripts are placed:
- `initial-load-start`: At the very start of `<head>`
- `initial-load-end`: At the very end of `<body>`

### FastBoot / SSR

The performance instrumentation automatically detects FastBoot and disables client-side instrumentation during server rendering. No changes needed.

## Removed Features

The following v1-specific features are no longer available:

1. **`contentFor` hooks** - Scripts must be added manually
2. **`@embroider/macros` config** - Use direct `init()` options
3. **`injectedScriptHashes` export from addon** - Use `INITIAL_LOAD_*_SCRIPT_HASH` constants instead

## Questions?

- [Sentry Ember Documentation](https://docs.sentry.io/platforms/javascript/guides/ember/)
- [GitHub Issues](https://github.com/getsentry/sentry-javascript/issues)
