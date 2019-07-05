# Upgrading from 4.x to 5.x

In this version upgrade, there are a few breaking changes. This guide should help you update your code accordingly.

## Integrations

We moved optional integrations into their own package, called `@sentry/integrations`. Also, we made a few default
integrations now optional. This is probably the biggest breaking change regarding the upgrade.

Integrations that are now opt-in and were default before:

- Dedupe (responsible for sending the same error only once)
- ExtraErrorData (responsible for doing fancy magic, trying to extract data out of the error object using any
  non-standard keys)

Integrations that were pluggable/optional before, that also live in this package:

- Angular (browser)
- Debug (browser/node)
- Ember (browser)
- ReportingObserver (browser)
- RewriteFrames (browser/node)
- Transaction (browser/node)
- Vue (browser)

### How to use `@sentry/integrations`?

Lets start with the approach if you install `@sentry/browser` / `@sentry/node` with `npm` or `yarn`.

Given you have a `Vue` application running, in order to use the `Vue` integration you need to do the following:

With `4.x`:

```js
import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: '___PUBLIC_DSN___',
  integrations: [
    new Sentry.Integrations.Vue({
      Vue,
      attachProps: true,
    }),
  ],
});
```

With `5.x` you need to install `@sentry/integrations` and change the import.

```js
import * as Sentry from '@sentry/browser';
import * as Integrations from '@sentry/integrations';

Sentry.init({
  dsn: '___PUBLIC_DSN___',
  integrations: [
    new Integrations.Vue({
      Vue,
      attachProps: true,
    }),
  ],
});
```

In case you are using the CDN version or the Loader, we provide a standalone file for every integration, you can use it
like this:

```html
<!-- Note that we now also provide a es6 build only -->
<!-- <script src="https://browser.sentry-cdn.com/5.0.0/bundle.es6.min.js" crossorigin="anonymous"></script> -->
<script src="https://browser.sentry-cdn.com/5.0.0/bundle.min.js" crossorigin="anonymous"></script>

<!-- If you include the integration it will be available under Sentry.Integrations.Vue -->
<script src="https://browser.sentry-cdn.com/5.0.0/vue.min.js" crossorigin="anonymous"></script>

<script>
  Sentry.init({
    dsn: '___PUBLIC_DSN___',
    integrations: [
      new Sentry.Integrations.Vue({
        Vue,
        attachProps: true,
      }),
    ],
  });
</script>
```

## New Scope functions

We realized how annoying it is to set a whole object using `setExtra`, that's why there are now a few new methods on the
`Scope`.

```typescript
setTags(tags: { [key: string]: string }): this;
setExtras(extras: { [key: string]: any }): this;
clearBreadcrumbs(): this;
```

So you can do this now:

```js
// New in 5.x setExtras
Sentry.withScope(scope => {
  scope.setExtras(errorInfo);
  Sentry.captureException(error);
});

// vs. 4.x
Sentry.withScope(scope => {
  Object.keys(errorInfo).forEach(key => {
    scope.setExtra(key, errorInfo[key]);
  });
  Sentry.captureException(error);
});
```

## Less Async API

We removed a lot of the internal async code since in certain situations it generated a lot of memory pressure. This
really only affects you if you where either using the `BrowserClient` or `NodeClient` directly.

So all the `capture*` functions now instead of returning `Promise<Response>` return `string | undefined`. `string` in
this case is the `event_id`, in case the event will not be sent because of filtering it will return `undefined`.

## `close` vs. `flush`

In `4.x` we had both `close` and `flush` on the `Client` draining the internal queue of events, helpful when you were
using `@sentry/node` on a serverless infrastructure.

Now `close` and `flush` work similar, with the difference that if you call `close` in addition to returing a `Promise`
that you can await it also **disables** the client so it will not send any future events.

# Migrating from `raven-js` to `@sentry/browser`

`@sentry/browser` needs polyfills to work in IE 11 or older, see: https://docs.sentry.io/platforms/javascript/#browser-table
Here are some examples of how the new SDKs work. Please note that the API for all JavaScript SDKs is the same.

#### Installation

_Old_:

```js
Raven.config('___PUBLIC_DSN___', {
  release: '1.3.0',
}).install();
```

_New_:

```js
Sentry.init({
  dsn: '___PUBLIC_DSN___',
  release: '1.3.0',
});
```

#### Set a global tag

_Old_:

```js
Raven.setTagsContext({ key: 'value' });
```

_New_:

```js
Sentry.setTag('key', 'value');
```

#### Capture custom exception

_Old_:

```js
try {
  throwingFunction();
} catch (e) {
  Raven.captureException(e, { extra: { debug: false } });
}
```

_New_:

```js
try {
  throwingFunction();
} catch (e) {
  Sentry.withScope(scope => {
    scope.setExtra('debug', false);
    Sentry.captureException(e);
  });
}
```

#### Capture a message

_Old_:

```js
Raven.captureMessage('test', 'info', { extra: { debug: false } });
```

_New_:

```js
Sentry.withScope(scope => {
  scope.setExtra('debug', false);
  Sentry.captureMessage('test', 'info');
});
```

#### Breadcrumbs

_Old_:

```js
Raven.captureBreadcrumb({
  message: 'Item added to shopping cart',
  category: 'action',
  data: {
    isbn: '978-1617290541',
    cartSize: '3',
  },
});
```

_New_:

```js
Sentry.addBreadcrumb({
  message: 'Item added to shopping cart',
  category: 'action',
  data: {
    isbn: '978-1617290541',
    cartSize: '3',
  },
});
```

