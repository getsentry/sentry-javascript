<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Sentry Tracing Extensions

[![npm version](https://img.shields.io/npm/v/@sentry/tracing.svg)](https://www.npmjs.com/package/@sentry/tracing)
[![npm dm](https://img.shields.io/npm/dm/@sentry/tracing.svg)](https://www.npmjs.com/package/@sentry/tracing)
[![npm dt](https://img.shields.io/npm/dt/@sentry/tracing.svg)](https://www.npmjs.com/package/@sentry/tracing)
[![typedoc](https://img.shields.io/badge/docs-typedoc-blue.svg)](http://getsentry.github.io/sentry-javascript/)

## Links

- [Official SDK Docs](https://docs.sentry.io/quickstart/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## General

This package contains extensions to the `@sentry/hub` to enable Sentry AM related functionality. It also provides integrations for Browser and Node that provide a good experience out of the box.

## Migrating from @sentry/apm to @sentry/tracing

The `@sentry/tracing` package is the replacement to the `@sentry/apm` package. No functionality has changed between
the packages, but there are some steps required for upgrade.

First, you must update your imports from the `Tracing` integration to the `BrowserTracing` integration.

```ts
import * as Sentry from "@sentry/browser";
import { Integrations } from "@sentry/tracing";

Sentry.init({
  integrations: [
    new Integrations.BrowserTracing({}),
  ]
})
```

Next, if you were using the `beforeNavigate` option, the API has changed to this type:

```ts
/**
 * beforeNavigate is called before a pageload/navigation transaction is created and allows for users
 * to set a custom transaction context.
 *
 * If undefined is returned, a pageload/navigation transaction will not be created.
 */
beforeNavigate(context: TransactionContext): TransactionContext | undefined;
```

We removed the location argument, in favour of being able to see what the transaction context is on creation. You will
have to access `window.location` yourself if you want to replicate that. In addition, if you return undefined in
`beforeNavigate`, the transaction will not be created.

```ts
import * as Sentry from "@sentry/browser";
import { Integrations } from "@sentry/tracing";

Sentry.init({
  integrations: [
    new Integrations.BrowserTracing({
      beforeNavigate: (ctx) => {
        return {
          ...ctx,
          name: getTransactionName(ctx.name, window.location)
        }
      }
    }),
  ]
})
```
