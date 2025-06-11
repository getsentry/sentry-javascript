# Add `ignoreLayers` and `ignoreLayersType` options to Express integration

This PR adds two new options to the Express integration: `ignoreLayers` and `ignoreLayersType`, bringing it to feature parity with the underlying OpenTelemetry instrumentation.

## Changes

- Added `ignoreLayers` option to ignore specific Express layers based on their path
- Added `ignoreLayersType` option to ignore specific Express layers based on their type
- Added comprehensive tests for both options
- Updated JSDoc documentation with usage examples

## Usage

### Ignore layers by path

The `ignoreLayers` option accepts an array of elements that can be:
- `string` for full match of the path
- `RegExp` for partial match of the path
- `function` in the form of `(path) => boolean` for custom logic

```javascript
const Sentry = require('@sentry/node');

Sentry.init({
  integrations: [
    Sentry.expressIntegration({
      ignoreLayers: [
        '/health',              // Ignore exact path
        /^\/internal/,          // Ignore paths starting with /internal
        (path) => path.includes('admin') // Custom logic
      ]
    })
  ],
});
```

### Ignore layers by type

The `ignoreLayersType` option accepts an array of the following strings:
- `router` - for `express.Router()`
- `middleware` - for middleware functions
- `request_handler` - for request handlers (anything that's not a router or middleware)

```javascript
const Sentry = require('@sentry/node');

Sentry.init({
  integrations: [
    Sentry.expressIntegration({
      ignoreLayersType: ['middleware'] // Ignore all middleware spans
    })
  ],
});
```

### Combining both options

Both options can be used together:

```javascript
const Sentry = require('@sentry/node');

Sentry.init({
  integrations: [
    Sentry.expressIntegration({
      ignoreLayers: ['/health', '/metrics', /^\/internal/],
      ignoreLayersType: ['middleware']
    })
  ],
});
```

## Note

While this allows ignoring specific Express layers, to ignore entire Express routes from creating traces, you should use the `ignoreIncomingRequestHook` option from the HTTP instrumentation as documented in the [Express documentation](https://docs.sentry.io/platforms/javascript/guides/express/).
