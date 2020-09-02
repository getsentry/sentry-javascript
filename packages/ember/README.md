<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Official Sentry SDK for Ember.js

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## General

This package is an Ember addon that wraps `@sentry/browser`, with added functionality related to Ember. All methods available in
`@sentry/browser` can be imported from `@sentry/ember`.

### Installation

As with other Ember addons, run:
`ember install @sentry/ember`

Then add the following config to `config/environment.js`

```javascript
  ENV['@sentry/ember'] = {
    sentry: {
      dsn: '__DSN__' // replace __DSN__ with your DSN
    }
  };
```

### Usage

To use this SDK, call `InitSentryForEmber` before the application is initialized, in `app.js`. This will load Sentry config from `environment.js` for you.

```javascript
import Application from '@ember/application';
import Resolver from 'ember-resolver';
import loadInitializers from 'ember-load-initializers';
import config from './config/environment';
import { InitSentryForEmber } from '@sentry/ember';

InitSentryForEmber();

export default class App extends Application {
  modulePrefix = config.modulePrefix;
  podModulePrefix = config.podModulePrefix;
  Resolver = Resolver;
}
```

### Additional Configuration

Aside from configuration passed from this addon into `@sentry/browser` via the `sentry` property, there is also the following Ember specific configuration.

```javascript
  ENV['@sentry/ember'] = {
    ignoreEmberOnErrorWarning: false, // Will silence Ember.onError warning without the need of using Ember debugging tools. False by default.
    sentry: ... // See sentry-javascript configuration https://docs.sentry.io/error-reporting/configuration/?platform=javascript
  };
```
#### Disabling Performance

`@sentry/ember` captures performance by default, if you would like to disable the automatic performance instrumentation, you can add the following to your `config/environment.js`:

```javascript
  ENV['@sentry/ember'] = {
    disablePerformance: true, // Will disable automatic instrumentation of performance. Manual instrumentation will still be sent.
    sentry: ... // See sentry-javascript configuration https://docs.sentry.io/error-reporting/configuration/?platform=javascript
  };
```

### Performance
#### Routes
If you would like to capture `beforeModel`, `model`, `afterModel` and `setupController` times for one of your routes,
you can import `instrumentRoutePerformance` and wrap your route with it.

```javascript
import Route from '@ember/routing/route';
import { instrumentRoutePerformance } from '@sentry/ember';

export default instrumentRoutePerformance(
  class MyRoute extends Route {
    model() {
      //...
    }
  }
);
```

### Supported Versions

`@sentry/ember` currently supports Ember **3.8+** for error monitoring.

### Previous Integration

Previously we've recommended using the Ember integration from `@sentry/integrations` but moving forward we will be using
this Ember addon to offer more Ember-specific error and performancing monitoring.

## Testing

You can find example instrumentation in the `dummy` application, which is also used for testing. To test with the dummy
application, you must pass the dsn as an environment variable.

```javascript
SENTRY_DSN=__DSN__ ember serve
```
