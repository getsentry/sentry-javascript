# Upgrading from 6.x to 7.x

The v7 version of the JavaScript SDK requires a self-hosted version of Sentry 20.6.0 or higher.

The main goal of version 7 is to reduce bundle size. This version is breaking because we removed deprecated APIs,
upgraded our build tooling, and restructured npm package contents. Below we will outline all the breaking changes you
should consider when upgrading.

**TL;DR** If you only use basic features of Sentry, or you simply copy & pasted the setup examples from our docs, here's
what changed for you:

- If you installed additional Sentry packages, such as`@sentry/tracing` alongside your Sentry SDK (e.g. `@sentry/react`
  or `@sentry/node`), make sure to upgrade all of them to version 7.
- Our CDN bundles are now ES6 - you will need to [reconfigure your script tags](#renaming-of-cdn-bundles) if you want to
  keep supporting ES5 and IE11 on the new SDK version.
- Distributed CommonJS files will be ES6. Use a transpiler if you need to support old node versions.
- We bumped the TypeScript version we generate our types with to 3.8.3. Please check if your TypeScript projects using
  TypeScript version 3.7 or lower still compile. Otherwise, upgrade your TypeScript version.
- `whitelistUrls` and `blacklistUrls` have been renamed to `allowUrls` and `denyUrls` in the `Sentry.init()` options.
- The `UserAgent` integration is now called `HttpContext`.
- If you are using Performance Monitoring and with tracing enabled, you might have to
  [make adjustments to your server's CORS settings](#propagation-of-baggage-header)

## Dropping Support for Node.js v6

Node.js version 6 has reached end of life in April 2019. For Sentry JavaScript SDK version 7, we will no longer be
supporting version 6 of Node.js.

As far as SDK development goes, dropping support means no longer running integration tests for Node.js version 6, and
also no longer handling edge cases specific to version 6. Running the new SDK version on Node.js v6 is therefore highly
discouraged.

## Removal of `@sentry/minimal`

The `@sentry/minimal` package was deleted and it's functionality was moved to `@sentry/hub`. All exports from
`@sentry/minimal` should be available in `@sentry/hub` other than `_callOnClient` function which was removed.

```ts
// New in v7:
import { addBreadcrumb, captureException, configureScope, setTag } from '@sentry/hub';

// Before:
import { addBreadcrumb, captureException, configureScope, setTag } from '@sentry/minimal';
```

## Explicit Client Options

In v7, we've updated the `Client` to have options separate from the options passed into `Sentry.init`. This means that
constructing a client now requires 3 options: `integrations`, `transport` and `stackParser`. These can be customized as
you see fit.

```ts
import { BrowserClient, defaultStackParser, defaultIntegrations, makeFetchTransport } from '@sentry/browser';

// New in v7:
const client = new BrowserClient({
  transport: makeFetchTransport,
  stackParser: defaultStackParser,
  integrations: defaultIntegrations,
});

// Before:
const client = new BrowserClient();
```

Since you now explicitly pass in the dependencies of the client, you can also tree-shake out dependencies that you do
not use this way. For example, you can tree-shake out the SDK's default integrations and only use the ones that you want
like so:

```ts
import {
  BrowserClient,
  Breadcrumbs,
  Dedupe,
  defaultStackParser,
  GlobalHandlers,
  Integrations,
  makeFetchTransport,
  LinkedErrors,
} from '@sentry/browser';

// New in v7:
const client = new BrowserClient({
  transport: makeFetchTransport,
  stackParser: defaultStackParser,
  integrations: [new Breadcrumbs(), new GlobalHandlers(), new LinkedErrors(), new Dedupe()],
});
```

## Removal Of Old Platform Integrations From `@sentry/integrations` Package

The following classes will be removed from the `@sentry/integrations` package and can no longer be used:

- `Angular`
- `Ember`
- `Vue`

These classes have been superseded and were moved into their own packages, `@sentry/angular`, `@sentry/ember`, and
`@sentry/vue` in a previous version. Refer to those packages if you want to integrate Sentry into your Angular, Ember,
or Vue application.

## Moving To ES6 For CommonJS Files

From version 7 onwards, the CommonJS files in Sentry JavaScript SDK packages will use ES6.

If you need to support Internet Explorer 11 or old Node.js versions, we recommend using a preprocessing tool like
[Babel](https://babeljs.io/) to convert Sentry packages to ES5.

## Renaming Of CDN Bundles

CDN bundles will be ES6 by default. Files that followed the naming scheme `bundle.es6.min.js` were renamed to
`bundle.min.js` and any bundles using ES5 (files without `.es6`) turned into `bundle.es5.min.js`.

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

**CDN bundles of version 7 or higher will no longer be distributed through our npm package.** This means that most
third-party CDNs like [unpkg](https://unpkg.com/) or [jsDelivr](https://www.jsdelivr.com/) will also not provide them.

If you depend on any specific files in a Sentry JavaScript npm package, you will most likely need to update their
references. For example, imports on `@sentry/browser/dist/client` will become `@sentry/browser/cjs/client`. However,
directly importing from specific files is discouraged.

## Removing the `API` class from `@sentry/core`

The internal `API` class was removed in favor of using client options explicitly.

```js
// New in v7:
import {
  initAPIDetails,
  getEnvelopeEndpointWithUrlEncodedAuth,
  getStoreEndpointWithUrlEncodedAuth,
} from '@sentry/core';

const client = getCurrentHub().getClient();
const dsn = client.getDsn();
const options = client.getOptions();
const envelopeEndpoint = getEnvelopeEndpointWithUrlEncodedAuth(dsn, options.tunnel);

// Before:
import { API } from '@sentry/core';

const api = new API(dsn, metadata, tunnel);
const dsn = api.getDsn();
const storeEndpoint = api.getStoreEndpointWithUrlEncodedAuth();
const envelopeEndpoint = api.getEnvelopeEndpointWithUrlEncodedAuth();
```

## Transport Changes

The `Transport` API was simplified and some functionality (e.g. APIDetails and client reports) was refactored and moved
to the Client. To send data to Sentry, we switched from the previously used
[Store endpoint](https://develop.sentry.dev/sdk/store/) to the
[Envelopes endpoint](https://develop.sentry.dev/sdk/envelopes/).

This example shows the new v7 and the v6 Transport API:

```js
// New in v7:
export interface Transport {
  /* Sends an envelope to the Envelope endpoint in Sentry */
  send(request: Envelope): PromiseLike<void>;
  /* Waits for all events to be sent or the timeout to expire, whichever comes first */
  flush(timeout?: number): PromiseLike<boolean>;
}

// Before:
export interface Transport {
  /* Sends the event to the Store endpoint in Sentry */
  sendEvent(event: Event): PromiseLike<Response>;
  /* Sends the session to the Envelope endpoint in Sentry */
  sendSession?(session: Session | SessionAggregates): PromiseLike<Response>;
  /* Waits for all events to be sent or the timeout to expire, whichever comes first */
  close(timeout?: number): PromiseLike<boolean>;
  /* Increment the counter for the specific client outcome */
  recordLostEvent?(type: Outcome, category: SentryRequestType): void;
}
```

### Custom Transports

If you rely on a custom transport, you will need to make some adjustments to how it is created when migrating to v7.
Note that we changed our transports from a class-based to a functional approach, meaning that the previously class-based
transports are now created via functions. This also means that custom transports are now passed by specifying a factory
function in the `Sentry.init` options object instead passing the custom transport's class.

The following example shows how to create a custom transport in v7 vs. how it was done in v6:

```js
// New in v7:
import { BaseTransportOptions, Transport, TransportMakeRequestResponse, TransportRequest } from '@sentry/types';
import { createTransport } from '@sentry/core';

export function makeMyCustomTransport(options: BaseTransportOptions): Transport {
  function makeRequest(request: TransportRequest): PromiseLike<TransportMakeRequestResponse> {
    // this is where your sending logic goes
    const myCustomRequest = {
      body: request.body,
      url: options.url
    };
    // you define how `sendMyCustomRequest` works
    return sendMyCustomRequest(myCustomRequest).then(response => ({
      headers: {
        'x-sentry-rate-limits': response.headers.get('X-Sentry-Rate-Limits'),
        'retry-after': response.headers.get('Retry-After'),
      },
    }));
  }

  // `createTransport` takes care of rate limiting and flushing
  return createTransport(options, makeRequest);
}

Sentry.init({
  dsn: '...',
  transport: makeMyCustomTransport, // this function will be called when the client is initialized
  ...
})

// Before:
class MyCustomTransport extends BaseTransport {
  constructor(options: TransportOptions) {
    // initialize your transport here
    super(options);
  }

  public sendEvent(event: Event): PromiseLike<Response> {
    // this is where your sending logic goes
    // `url` is decoded from dsn in BaseTransport
    const myCustomRequest = createMyCustomRequestFromEvent(event, this.url);
    return sendMyCustomRequest(myCustomRequest).then(() => resolve({status: 'success'}));
  }

  public sendSession(session: Session): PromiseLike<Response> {...}
  // ...
}

Sentry.init({
  dsn: '...',
  transport: MyCustomTransport, // the constructor was called when the client was initialized
  ...
})
```

Overall, the new way of transport creation allows you to create your custom sending implementation without having to
deal with the conversion of events or sessions to envelopes. We recommend calling using the `createTransport` function
from `@sentry/core` as demonstrated in the example above which, besides creating the `Transport` object with your custom
logic, will also take care of rate limiting and flushing.

For a complete v7 transport implementation, take a look at our
[browser fetch transport](https://github.com/getsentry/sentry-javascript/blob/ebc938a03d6efe7d0c4bbcb47714e84c9a566a9c/packages/browser/src/transports/fetch.ts#L1-L34).

### Node Transport Changes

To clean up the options interface, we now require users to pass down transport related options under the
`transportOptions` key. The options that were changed were `caCerts`, `httpProxy`, and `httpsProxy`. In addition,
`httpProxy` and `httpsProxy` were unified to a single option under the `transportOptions` key, `proxy`.

```ts
// New in v7:
Sentry.init({
  dsn: '...',
  transportOptions: {
    caCerts: getMyCaCert(),
    proxy: 'http://example.com',
  },
});

// Before:
Sentry.init({
  dsn: '...',
  caCerts: getMyCaCert(),
  httpsProxy: 'http://example.com',
});
```

## Enum Changes

Given that enums have a high bundle-size impact, our long term goal is to eventually remove all enums from the SDK in
favor of string literals.

### Removed Enums

- The previously deprecated enum `Status` was removed (see
  [#4891](https://github.com/getsentry/sentry-javascript/pull/4891)).
- The previously deprecated internal-only enum `RequestSessionStatus` was removed (see
  [#4889](https://github.com/getsentry/sentry-javascript/pull/4889)) in favor of string literals.
- The previously deprecated internal-only enum `SessionStatus` was removed (see
  [#4890](https://github.com/getsentry/sentry-javascript/pull/4890)) in favor of string literals.

### Deprecated Enums

The two enums `SpanStatus`, and `Severity` remain deprecated, as we decided to limit the number of high-impact breaking
changes in v7. They will be removed in the next major release which is why we strongly recommend moving to the
corresponding string literals. Here's how to adjust [`Severity`](#severity-severitylevel-and-severitylevels) and
[`SpanStatus`](#spanstatus).

## Session Changes

Note: These changes are not relevant for the majority of Sentry users but if you are building an SDK on top of the
Javascript SDK, you might need to make some adaptions. The internal `Session` class was refactored and replaced with a
more functional approach in [#5054](https://github.com/getsentry/sentry-javascript/pull/5054). Instead of the class, we
now export a `Session` interface from `@sentry/types` and three utility functions to create and update a `Session`
object from `@sentry/hub`. This short example shows what has changed and how to deal with the new functions:

```js
// New in v7:
import { makeSession, updateSession, closeSession } from '@sentry/hub';

const session = makeSession({ release: 'v1.0' });
updateSession(session, { environment: 'prod' });
closeSession(session, 'ok');

// Before:
import { Session } from '@sentry/hub';

const session = new Session({ release: 'v1.0' });
session.update({ environment: 'prod' });
session.close('ok');
```

## Propagation of Baggage Header

We introduced a new way of propagating tracing and transaction-related information between services. This change adds
the [`baggage` HTTP header](https://www.w3.org/TR/baggage/) to outgoing requests if the instrumentation of requests is
enabled. Since this adds a header to your HTTP requests, you might need to adjust your Server's CORS settings to allow
this additional header. Take a look at the
[Sentry docs](https://docs.sentry.io/platforms/javascript/performance/connect-services/#navigation-and-other-xhr-requests)
for more in-depth instructions what to change.

## General API Changes

For our efforts to reduce bundle size of the SDK we had to remove and refactor parts of the package which introduced a
few changes to the API:

- Remove support for deprecated `@sentry/apm` package. `@sentry/tracing` should be used instead.
- Remove deprecated `user` field from DSN. `publicKey` should be used instead.
- Remove deprecated `whitelistUrls` and `blacklistUrls` options from `Sentry.init`. They have been superseded by
  `allowUrls` and `denyUrls` specifically. See
  [our docs page on inclusive language](https://develop.sentry.dev/inclusion/) for more details.
- Gatsby SDK: Remove `Sentry` from `window` object.
- Remove deprecated `Status`, `SessionStatus`, and `RequestSessionStatus` enums. These were only part of an internal
  API. If you are using these enums, we encourage you to to look at
  [b177690d](https://github.com/getsentry/sentry-javascript/commit/b177690d89640aef2587039113c614672c07d2be),
  [5fc3147d](https://github.com/getsentry/sentry-javascript/commit/5fc3147dfaaf1a856d5923e4ba409479e87273be), and
  [f99bdd16](https://github.com/getsentry/sentry-javascript/commit/f99bdd16539bf6fac14eccf1a974a4988d586b28) to to see
  the changes we've made to our code as result. We generally recommend using string literals instead of the removed
  enums.
- Remove 'critical' severity.
- Remove deprecated `getActiveDomain` method and `DomainAsCarrier` type from `@sentry/hub`.
- Rename `registerRequestInstrumentation` to `instrumentOutgoingRequests` in `@sentry/tracing`.
- Remove `Backend` and port its functionality into `Client` (see
  [#4911](https://github.com/getsentry/sentry-javascript/pull/4911) and
  [#4919](https://github.com/getsentry/sentry-javascript/pull/4919)). `Backend` was an unnecessary abstraction which is
  not present in other Sentry SDKs. For the sake of reducing complexity, increasing consistency with other Sentry SDKs
  and decreasing bundle-size, `Backend` was removed.
- Remove support for Opera browser pre v15.
- Rename `UserAgent` integration to `HttpContext`. (see
  [#5027](https://github.com/getsentry/sentry-javascript/pull/5027))
- Remove `SDK_NAME` export from `@sentry/browser`, `@sentry/node`, `@sentry/tracing` and `@sentry/vue` packages.
- Removed `eventStatusFromHttpCode` to save on bundle size.
- Replace `BrowserTracing` `maxTransactionDuration` option with `finalTimeout` option
- Removed `ignoreSentryErrors` option from AWS lambda SDK. Errors originating from the SDK will now _always_ be caught
  internally.
- Removed `Integrations.BrowserTracing` export from `@sentry/nextjs`. Please import `BrowserTracing` from
  `@sentry/nextjs` directly.
- Removed static `id` property from `BrowserTracing` integration.
- Removed usage of deprecated `event.stacktrace` field

## Sentry Angular SDK Changes

The Sentry Angular SDK (`@sentry/angular`) is now compiled with the Angular compiler (see
[#4641](https://github.com/getsentry/sentry-javascript/pull/4641)). This change was necessary to fix a long-lasting bug
in the SDK (see [#3282](https://github.com/getsentry/sentry-javascript/issues/3282)): `TraceDirective` and `TraceModule`
can now be used again without risking an application compiler error or having to disable AOT compilation.

### Angular Version Compatibility

As in v6, we continue to list Angular 10-13 in our peer dependencies, meaning that these are the Angular versions we
officially support. If you are using v7 with Angular <10 in your project and you experience problems, we recommend
staying on the latest 6.x version until you can upgrade your Angular version. As v7 of our SDK is compiled with the
Angular 10 compiler and we upgraded our Typescript version, the SDK will work with Angular 10 and above. Tests have
shown that Angular 9 seems to work as well (use at your own risk) but we recommend upgrading to a more recent Angular
version.

### Import Changes

Due to the compiler change, our NPM package structure changed as well as it now conforms to the
[Angular Package Format v10](https://docs.google.com/document/d/1uh2D6XqaGh2yjjXwfF4SrJqWl1MBhMPntlNBBsk6rbw/edit). In
case you're importing from specific paths other than `@sentry/angular` you will have to adjust these paths. As an
example, `import ... from '@sentry/angular/esm/injex.js'` should be changed to
`import ... from '@sentry/angular/esm2015/index.js'`. Generally, we strongly recommend only importing from
`@sentry/angular`.

# Upgrading from 6.17.x to 6.18.0

Version 6.18.0 deprecates the `frameContextLines` top-level option for the Node SDK. This option will be removed in an
upcoming major version. To migrate off of the top-level option, pass it instead to the new `ContextLines` integration.

```js
// New in 6.18.0
init({
  dsn: '__DSN__',
  integrations: [new ContextLines({ frameContextLines: 10 })],
});

// Before:
init({
  dsn: '__DSN__',
  frameContextLines: 10,
});
```

# Upgrading from 6.x to 6.17.x

You only need to make changes when migrating to `6.17.x` if you are using our internal `Dsn` class. Our internal API
class and typescript enums were deprecated, so we recommend you migrate them as well.

The internal `Dsn` class was removed in `6.17.0`. For additional details, you can look at the
[PR where this change happened](https://github.com/getsentry/sentry-javascript/pull/4325). To migrate, see the following
example.

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

The internal API class was deprecated, and will be removed in the next major release. More details can be found in the
[PR that made this change](https://github.com/getsentry/sentry-javascript/pull/4281). To migrate, see the following
example.

```js
// New in 6.17.0:
import {
  initAPIDetails,
  getEnvelopeEndpointWithUrlEncodedAuth,
  getStoreEndpointWithUrlEncodedAuth,
} from '@sentry/core';

const dsn = initAPIDetails(dsn, metadata, tunnel);
const dsn = api.dsn;
const storeEndpoint = getStoreEndpointWithUrlEncodedAuth(api.dsn);
const envelopeEndpoint = getEnvelopeEndpointWithUrlEncodedAuth(api.dsn, api.tunnel);

// Before:
import { API } from '@sentry/core';

const api = new API(dsn, metadata, tunnel);
const dsn = api.getDsn();
const storeEndpoint = api.getStoreEndpointWithUrlEncodedAuth();
const envelopeEndpoint = api.getEnvelopeEndpointWithUrlEncodedAuth();
```

## Enum changes

The enums `Status`, `SpanStatus`, and `Severity` were deprecated, and we've detailed how to migrate away from them
below. We also deprecated the `TransactionMethod`, `Outcome` and `RequestSessionStatus` enums, but those are
internal-only APIs. If you are using them, we encourage you to take a look at the corresponding PRs to see how we've
changed our code as a result.

- `TransactionMethod`: https://github.com/getsentry/sentry-javascript/pull/4314
- `Outcome`: https://github.com/getsentry/sentry-javascript/pull/4315
- `RequestSessionStatus`: https://github.com/getsentry/sentry-javascript/pull/4316

#### Status

We deprecated the `Status` enum in `@sentry/types` and it will be removed in the next major release. We recommend using
string literals to save on bundle size. [PR](https://github.com/getsentry/sentry-javascript/pull/4298). We also removed
the `Status.fromHttpCode` method. This was done to save on bundle size.

```js
// New in 6.17.0:
import { eventStatusFromHttpCode } from '@sentry/utils';

const status = eventStatusFromHttpCode(500);

// Before:
import { Status } from '@sentry/types';

const status = Status.fromHttpCode(500);
```

#### SpanStatus

We deprecated the `Status` enum in `@sentry/tracing` and it will be removed in the next major release. We recommend
using string literals to save on bundle size. [PR](https://github.com/getsentry/sentry-javascript/pull/4299). We also
removed the `SpanStatus.fromHttpCode` method. This was done to save on bundle size.

```js
// New in 6.17.0:
import { spanStatusfromHttpCode } from '@sentry/tracing';

const status = spanStatusfromHttpCode(403);

// Before:
import { SpanStatus } from '@sentry/tracing';

const status = SpanStatus.fromHttpCode(403);
```

#### Severity, SeverityLevel, and SeverityLevels

We deprecated the `Severity` enum in `@sentry/types` and it will be removed in the next major release. We recommend
using string literals (typed as `SeverityLevel`) to save on bundle size.

```js
// New in 6.17.5:
import { SeverityLevel } from '@sentry/types';

const levelA = "error" as SeverityLevel;

const levelB: SeverityLevel = "error"

// Before:
import { Severity, SeverityLevel } from '@sentry/types';

const levelA = Severity.error;

const levelB: SeverityLevel = "error"
```
