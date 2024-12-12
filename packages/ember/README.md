<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for Ember.js

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## General

This package is an Ember addon that wraps `@sentry/browser`, with added functionality related to Ember. All methods
available in `@sentry/browser` can be imported from `@sentry/ember`.

### Installation

As with other Ember addons, run: `ember install @sentry/ember`

Then add the following to your `<your-app>/app.js`

```javascript
  import * as Sentry from "@sentry/ember";

  Sentry.init({
    dsn: '__DSN__' // replace __DSN__ with your DSN,

    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production,
    tracesSampleRate: 1.0,
  });
```

### Usage

To use this SDK, call `Sentry.init` before the application is initialized, in `app.js`. This will allow Sentry to
capture information while your app is starting. Any additional SDK settings can be modified via the usual config in
`environment.js` for you, see the Additional Configuration section for more details.

```javascript
import Application from '@ember/application';
import Resolver from 'ember-resolver';
import loadInitializers from 'ember-load-initializers';
import config from './config/environment';
import * as Sentry from "@sentry/ember";

Sentry.init({
  dsn: '__DSN__' // replace __DSN__ with your DSN,

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production,
  tracesSampleRate: 1.0,
});

export default class App extends Application {
  modulePrefix = config.modulePrefix;
  podModulePrefix = config.podModulePrefix;
  Resolver = Resolver;
}
```

### Additional Configuration

Aside from configuration passed from this addon into `@sentry/browser` via the `sentry` property, there is also the
following Ember specific configuration:

```javascript
ENV['@sentry/ember'] = {
  // Will silence Ember.onError warning without the need of using Ember debugging tools.
  ignoreEmberOnErrorWarning: false,

  // Will disable automatic instrumentation of performance.
  // Manual instrumentation will still be sent.
  disablePerformance: true,

  // All runloop queue durations will be added as spans.
  minimumRunloopQueueDuration: 0,

  // Will disable automatic instrumentation for components.
  disableInstrumentComponents: true,

  // All (non-glimmer) component render durations will be added as spans.
  minimumComponentRenderDuration: 0,

  // All component definitions will be added as spans.
  enableComponentDefinition: true,
};
```

#### Disabling Performance

`@sentry/ember` captures performance by default, if you would like to disable the automatic performance instrumentation,
you can add the following to your `config/environment.js`:

```javascript
ENV['@sentry/ember'] = {
  disablePerformance: true, // Will disable automatic instrumentation of performance. Manual instrumentation will still be sent.
};
```

### Performance

#### Routes

If you would like to capture `beforeModel`, `model`, `afterModel` and `setupController` times for one of your routes,
you can import `instrumentRoutePerformance` and wrap your route with it.

```javascript
import Route from '@ember/routing/route';
import { instrumentRoutePerformance } from '@sentry/ember';

class MyRoute extends Route {
  model() {
    //...
  }
}

export default instrumentRoutePerformance(MyRoute);
```

#### Runloop

The runloop queue durations are instrumented by default, as long as they are longer than a threshold (by default 5ms).
This helps (via the render queue) capturing the entire render in case component render times aren't fully instrumented,
such as when using glimmer components.

If you would like to change the runloop queue threshold, add the following to your config:

```javascript
ENV['@sentry/ember'] = {
  minimumRunloopQueueDuration: 0, // All runloop queue durations will be added as spans.
};
```

#### Components

Non-glimmer component render times will automatically get captured.

If you would like to disable component render being instrumented, add the following to your config:

```javascript
ENV['@sentry/ember'] = {
  disableInstrumentComponents: true, // Will disable automatic instrumentation for components.
};
```

Additionally, components whose render time is below a threshold (by default 2ms) will not be included as spans. If you
would like to change this threshold, add the following to your config:

```javascript
ENV['@sentry/ember'] = {
  minimumComponentRenderDuration: 0, // All (non-glimmer) component render durations will be added as spans.
};
```

#### Glimmer components

Currently glimmer component render durations can only be captured indirectly via the runloop instrumentation. You can
optionally enable a setting to show component definitions (which will indicate which components are being rendered) be
adding the following to your config:

```javascript
ENV['@sentry/ember'] = {
  enableComponentDefinition: true, // All component definitions will be added as spans.
};
```

### Supported Versions

- **Ember.js**: v4.0 or above
- **Node**: v14.18 or above

### Previous Integration

Previously we've recommended using the Ember integration from `@sentry/integrations` but moving forward we will be using
this Ember addon to offer more Ember-specific error and performancing monitoring.

## Testing

For this package itself, you can find example instrumentation in the `dummy` application, which is also used for
testing. To test with the dummy application, you must pass the dsn as an environment variable.

```javascript
SENTRY_DSN=__DSN__ ember serve
```
