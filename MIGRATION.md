# Upgrading from 6.x to 7.x

The main goal of version 7 is to reduce bundle size. This version is breaking because we removed deprecated APIs, upgraded our build tooling, and restructured npm package contents.
Below we will outline all the breaking changes you should consider when upgrading.

## Dropping Support for Node.js v6

Node.js version 6 has reached end of life in April 2019. For Sentry JavaScript SDK version 7, we will no longer be supporting version 6 of Node.js.

As far as SDK development goes, dropping support means no longer running integration tests for Node.js version 6, and also no longer handling edge cases specific to version 6.
Running the new SDK version on Node.js v6 is therefore highly discouraged.

## Removal of `@sentry/minimal`

The `@sentry/minimal` package was deleted and it's functionality was moved to `@sentry/hub`. All exports from `@sentry/minimal` should be avaliable in `@sentry/hub` other than `_callOnClient` function which was removed.

```ts
// New in v7:
import {
  addBreadcrumb,
  captureException,
  configureScope,
  setTag,
} from '@sentry/hub';

// Before:
import {
  addBreadcrumb,
  captureException,
  configureScope,
  setTag,
} from '@sentry/minimal';
```

## Removal Of Old Platform Integrations From `@sentry/integrations` Package

The following classes will be removed from the `@sentry/integrations` package and can no longer be used:

- `Angular`
- `Ember`
- `Vue`

These classes have been superseded and were moved into their own packages, `@sentry/angular`, `@sentry/ember`, and `@sentry/vue` in a previous version.
Refer to those packages if you want to integrate Sentry into your Angular, Ember, or Vue application.

## Moving To ES6 For CommonJS Files

From version 7 onwards, the CommonJS files in Sentry JavaScript SDK packages will use ES6.

If you need to support Internet Explorer 11 or old Node.js versions, we recommend using a preprocessing tool like [Babel](https://babeljs.io/) to convert Sentry packages to ES5.

## Renaming Of CDN Bundles

CDN bundles will be ES6 by default. Files that followed the naming scheme `bundle.es6.min.js` were renamed to `bundle.min.js` and any bundles using ES5 (files without `.es6`) turned into `bundle.es5.min.js`.

See our [docs on CDN bundles](https://docs.sentry.io/platforms/javascript/install/cdn/) for more information.

## Restructuring Of Package Content

Up until v6.x, we have published our packages on npm with the following structure:

- `build` folder contained CDN bundles
- `dist` folder contained CommonJS files and TypeScript declarations
- `esm` folder contained ESM files and TypeScript declarations

Moving forward the JavaScript SDK packages will generally have the following structure:

- `cjs` folder contains CommonJS files
- `esm` folder contains ESM files
- `types` folder contains TypeScript declarations

**CDN bundles of version 7 or higher will no longer be distributed through our npm package.**
This means that most third-party CDNs like [unpkg](https://unpkg.com/) or [jsDelivr](https://www.jsdelivr.com/) will also not provide them.

If you depend on any specific files in a Sentry JavaScript npm package, you will most likely need to update their references.
For example, imports on `@sentry/browser/dist/client` will become `@sentry/browser/cjs/client`.
However, directly importing from specific files is discouraged.

## Removing the `API` class from `@sentry/core`

The internal `API` class was removed in favor of the `initAPIDetails` function and the `APIDetails` type. More details can be found in the [PR that deprecated this class](https://github.com/getsentry/sentry-javascript/pull/4281). To migrate, see the following example.

```js
// New in v7:
import {
  initAPIDetails,
  getEnvelopeEndpointWithUrlEncodedAuth,
  getStoreEndpointWithUrlEncodedAuth,
} from '@sentry/core';

const dsn = initAPIDetails(dsn, metadata, tunnel);
const dsn = api.dsn;
const storeEndpoint = getEnvelopeEndpointWithUrlEncodedAuth(api.dsn, api.tunnel);
const envelopeEndpoint = getStoreEndpointWithUrlEncodedAuth(api.dsn);

// Before:
import { API } from '@sentry/core';

const api = new API(dsn, metadata, tunnel);
const dsn = api.getDsn();
const storeEndpoint = api.getStoreEndpointWithUrlEncodedAuth();
const envelopeEndpoint = api.getEnvelopeEndpointWithUrlEncodedAuth();
```

## Enum changes

Given that enums have a high bundle-size impact, our long term goal is to eventually remove all enums from the SDK in
favor of string literals.

### Removed Enums
* The previously deprecated enum `Status` was removed (see [#4891](https://github.com/getsentry/sentry-javascript/pull/4891)).
  [This example](#status) explains how to migrate.
* The previously deprecated internal-only enum `RequestSessionStatus` was removed (see
  [#4889](https://github.com/getsentry/sentry-javascript/pull/4889)) in favor of string literals.
* The previously deprecated internal-only enum `SessionStatus` was removed (see
  [#4890](https://github.com/getsentry/sentry-javascript/pull/4890)) in favor of string literals.

### Deprecated Enums
The two enums `SpanStatus`, and `Severity` remain deprecated, as we decided to limit the number of high-impact breaking
changes in v7. They will be removed in the next major release which is why we strongly recommend moving to the
corresponding string literals. Here's how to adjust [`Severity`](#severity-severitylevel-and-severitylevels) and
[`SpanStatus`](#spanstatus).

## General API Changes

For our efforts to reduce bundle size of the SDK we had to remove and refactor parts of the package which introduced a few changes to the API:

- Remove support for deprecated `@sentry/apm` package. `@sentry/tracing` should be used instead.
- Remove deprecated `user` field from DSN. `publicKey` should be used instead.
- Remove deprecated `whitelistUrls` and `blacklistUrls` options from `Sentry.init`. They have been superseded by `allowUrls` and `denyUrls` specifically. See [our docs page on inclusive language](https://develop.sentry.dev/inclusion/) for more details.
- Gatsby SDK: Remove `Sentry` from `window` object.
- Remove deprecated `Status`, `SessionStatus`, and `RequestSessionStatus` enums. These were only part of an internal API. If you are using these enums, we encourage you to to look at [b177690d](https://github.com/getsentry/sentry-javascript/commit/b177690d89640aef2587039113c614672c07d2be), [5fc3147d](https://github.com/getsentry/sentry-javascript/commit/5fc3147dfaaf1a856d5923e4ba409479e87273be), and [f99bdd16](https://github.com/getsentry/sentry-javascript/commit/f99bdd16539bf6fac14eccf1a974a4988d586b28) to to see the changes we've made to our code as result. We generally recommend using string literals instead of the removed enums.
- Remove deprecated `getActiveDomain` method and `DomainAsCarrier` type from `@sentry/hub`.
- Rename `registerRequestInstrumentation` to `instrumentOutgoingRequests` in `@sentry/tracing`.
- Remove `Backend` and port its functionality into `Client` (see
  [#4911](https://github.com/getsentry/sentry-javascript/pull/4911) and
  [#4919](https://github.com/getsentry/sentry-javascript/pull/4919)). `Backend` was an unnecessary abstraction which is
  not present in other Sentry SDKs. For the sake of reducing complexity, increasing consistency with other Sentry SDKs and
  decreasing bundle-size, `Backend` was removed.
- Remove support for Opera browser pre v15

## Sentry Angular SDK Changes

The Sentry Angular SDK (`@sentry/angular`) is now compiled with the Angular compiler (see [#4641](https://github.com/getsentry/sentry-javascript/pull/4641)). This change was necessary to fix a long-lasting bug in the SDK (see [#3282](https://github.com/getsentry/sentry-javascript/issues/3282)): `TraceDirective` and `TraceModule` can now be used again without risking an application compiler error or having to disable AOT compilation.

### Angular Version Compatibility

As in v6, we continue to list Angular 10-13 in our peer dependencies, meaning that these are the Angular versions we officially support.
If you are using v7 with Angular <10 in your project and you experience problems, we recommend staying on the latest 6.x
version until you can upgrade your Angular version. As v7 of our SDK is compiled with the Angular 10 compiler and we upgraded
our Typescript version, the SDK will work with Angular 10 and above. Tests have shown that Angular 9 seems to work as well
(use at your own risk) but we recommend upgrading to a more recent Angular version.

### Import Changes

Due to the compiler change, our NPM package structure changed as well as it now conforms to the [Angular Package Format v10](https://docs.google.com/document/d/1uh2D6XqaGh2yjjXwfF4SrJqWl1MBhMPntlNBBsk6rbw/edit).
In case you're importing from specific paths other than `@sentry/angular` you will have to adjust these paths. As an example, `import ... from '@sentry/angular/esm/injex.js'` should be changed to `import ... from '@sentry/angular/esm2015/index.js'`. Generally, we strongly recommend only importing from `@sentry/angular`.

# Upgrading from 6.17.x to 6.18.0

Version 6.18.0 deprecates the `frameContextLines` top-level option for the Node SDK. This option will be removed in an upcoming major version. To migrate off of the top-level option, pass it instead to the new `ContextLines` integration.

```js
// New in 6.18.0
init({
  dsn: '__DSN__',
  integrations: [new ContextLines({ frameContextLines: 10 })]
});

// Before:
init({
  dsn: '__DSN__',
  frameContextLines: 10,
});
```

# Upgrading from 6.x to 6.17.x

You only need to make changes when migrating to `6.17.x` if you are using our internal `Dsn` class. Our internal API class and typescript enums were deprecated, so we recommend you migrate them as well.

The internal `Dsn` class was removed in `6.17.0`. For additional details, you can look at the [PR where this change happened](https://github.com/getsentry/sentry-javascript/pull/4325). To migrate, see the following example.

```js
// New in 6.17.0:
import { dsnToString, makeDsn } from '@sentry/utils';

const dsn = makeDsn(process.env.SENTRY_DSN);
console.log(dsnToString(dsn));

// Before:
import { Dsn } from '@sentry/utils';

const dsn = new Dsn(process.env.SENTRY_DSN);
console.log(dsn.toString());
```

The internal API class was deprecated, and will be removed in the next major release. More details can be found in the [PR that made this change](https://github.com/getsentry/sentry-javascript/pull/4281). To migrate, see the following example.

```js
// New in 6.17.0:
import {
  initAPIDetails,
  getEnvelopeEndpointWithUrlEncodedAuth,
  getStoreEndpointWithUrlEncodedAuth,
} from '@sentry/core';

const dsn = initAPIDetails(dsn, metadata, tunnel);
const dsn = api.dsn;
const storeEndpoint = getEnvelopeEndpointWithUrlEncodedAuth(api.dsn, api.tunnel);
const envelopeEndpoint = getStoreEndpointWithUrlEncodedAuth(api.dsn);

// Before:
import { API } from '@sentry/core';

const api = new API(dsn, metadata, tunnel);
const dsn = api.getDsn();
const storeEndpoint = api.getStoreEndpointWithUrlEncodedAuth();
const envelopeEndpoint = api.getEnvelopeEndpointWithUrlEncodedAuth();
```

## Enum changes

The enums `Status`, `SpanStatus`, and `Severity` were deprecated, and we've detailed how to migrate away from them below. We also deprecated the `TransactionMethod`, `Outcome` and `RequestSessionStatus` enums, but those are internal-only APIs. If you are using them, we encourage you to take a look at the corresponding PRs to see how we've changed our code as a result.

- `TransactionMethod`: https://github.com/getsentry/sentry-javascript/pull/4314
- `Outcome`: https://github.com/getsentry/sentry-javascript/pull/4315
- `RequestSessionStatus`: https://github.com/getsentry/sentry-javascript/pull/4316

#### Status

We deprecated the `Status` enum in `@sentry/types` and it will be removed in the next major release. We recommend using string literals to save on bundle size. [PR](https://github.com/getsentry/sentry-javascript/pull/4298). We also removed the `Status.fromHttpCode` method. This was done to save on bundle size.

```js
// New in 6.17.0:
import { eventStatusFromHttpCode } from '@sentry/utils';

const status = eventStatusFromHttpCode(500);

// Before:
import { Status } from '@sentry/types';

const status = Status.fromHttpCode(500);
```

#### SpanStatus

We deprecated the `Status` enum in `@sentry/tracing` and it will be removed in the next major release. We recommend using string literals to save on bundle size. [PR](https://github.com/getsentry/sentry-javascript/pull/4299). We also removed the `SpanStatus.fromHttpCode` method. This was done to save on bundle size.

```js
// New in 6.17.0:
import { spanStatusfromHttpCode } from '@sentry/tracing';

const status = spanStatusfromHttpCode(403);

// Before:
import { SpanStatus } from '@sentry/tracing';

const status = SpanStatus.fromHttpCode(403);
```

#### Severity, SeverityLevel, and SeverityLevels

We deprecated the `Severity` enum in `@sentry/types` and it will be removed in the next major release. We recommend using string literals (typed as `SeverityLevel`) to save on bundle size.

`SeverityLevel` and `SeverityLevels` will continue to exist in v7, but they will live in `@sentry/utils` rather than `@sentry/types`. Currently, they live in both, for ease of migration. (`SeverityLevels` isn't included in the examples below because it is only useful internally.)

```js
// New in 6.17.5:
import { SeverityLevel } from '@sentry/utils';

const levelA = "error" as SeverityLevel;

const levelB: SeverityLevel = "error"

// Before:
import { Severity, SeverityLevel } from '@sentry/types';

const levelA = Severity.error;

const levelB: SeverityLevel = "error"
```

# Upgrading from 4.x to 5.x/6.x

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

We realized how annoying it is to set a whole object using `setExtra`, so there are now a few new methods on the
`Scope`.

```typescript
setTags(tags: { [key: string]: string | number | boolean | null | undefined }): this;
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

https://docs.sentry.io/platforms/javascript/#browser-table
Here are some examples of how the new SDKs work. Please note that the API for all JavaScript SDKs is the same.

#### Installation

> [Docs](https://docs.sentry.io/platforms/javascript/#connecting-the-sdk-to-sentry)

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

> [Docs](https://docs.sentry.io/platforms/javascript/#tagging-events)

_Old_:

```js
Raven.setTagsContext({ key: 'value' });
```

_New_:

```js
Sentry.setTag('key', 'value');
```

#### Set user context

_Old_:

```js
Raven.setUserContext({
  id: '123',
  email: 'david@example.com',
});
```

_New_:

```js
Sentry.setUser({
  id: '123',
  email: 'david@example.com',
});
```

#### Capture custom exception

> A scope must now be sent around a capture to add extra information. [Docs](https://docs.sentry.io/platforms/javascript/#unsetting-context)

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

> A scope must now be sent around a capture to add extra information. [Docs](https://docs.sentry.io/platforms/javascript/#unsetting-context)

_Old_:

```js
Raven.captureMessage('test1', 'info');
Raven.captureMessage('test2', 'info', { extra: { debug: false } });
```

_New_:

```js
Sentry.captureMessage('test1', 'info');
Sentry.withScope(scope => {
  scope.setExtra('debug', false);
  Sentry.captureMessage('test2', 'info');
});
```

#### Breadcrumbs

> [Docs](https://docs.sentry.io/platforms/javascript/#breadcrumbs)

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

### Ignoring Urls

> 'ignoreUrls' was renamed to 'denyUrls'. 'ignoreErrors', which has a similar name was not renamed. [Docs](https://docs.sentry.io/error-reporting/configuration/?platform=browser#deny-urls) and [Decluttering Sentry](https://docs.sentry.io/platforms/javascript/#decluttering-sentry)

_Old_:

```js
Raven.config('___PUBLIC_DSN___', {
  ignoreUrls: [
    'https://www.baddomain.com',
    /graph\.facebook\.com/i,
  ],
});
```

_New_:

```js
Sentry.init({
  denyUrls: [
    'https://www.baddomain.com',
    /graph\.facebook\.com/i,
  ],
});
```

### Ignoring Events (`shouldSendCallback`)

> `shouldSendCallback` was renamed to `beforeSend` ([#2253](https://github.com/getsentry/sentry-javascript/issues/2253)). Instead of returning `false`, you must return `null` to omit sending the event. [Docs](https://docs.sentry.io/error-reporting/configuration/filtering/?platform=browser#before-send)

_Old_:

```js
Raven.config('___PUBLIC_DSN___', {
  shouldSendCallback(event) {
    // Only send events that include user data
    if (event.user){
      return true;
    }
    return false;
  }
});
```

_New_:

```js
Sentry.init({
  beforeSend(event) {
    if (event.user) {
      return event;
    }
    return null
  }
});
```

### Modifying Events (`dataCallback`)

_Old_:

```js
Raven.config('___PUBLIC_DSN___', {
  dataCallback(event) {
    if (event.user) {
      // Don't send user's email address
      delete event.user.email;
    }
    return event;
  }
});
```

_New_:

```js
Sentry.init({
  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
    }
    return event;
  }
});
```

### Attaching Stacktraces

> 'stacktrace' was renamed to 'attachStacktrace'. [Docs](https://docs.sentry.io/error-reporting/configuration/?platform=browser#attach-stacktrace)

_Old_:

```js
Raven.config('___PUBLIC_DSN___', {
  stacktrace: true,
});
```

_New_:

```js
Sentry.init({
  attachStacktrace: true,
});
```

### Disabling Promises Handling

_Old_:

```js
Raven.config('___PUBLIC_DSN___', {
  captureUnhandledRejections: false,
});
```

_New_:

```js
Sentry.init({
  integrations: [new Sentry.Integrations.GlobalHandlers({
    onunhandledrejection: false
  })]
})
```
