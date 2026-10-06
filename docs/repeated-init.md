# Repeated `Sentry.init()` Calls

This document records how `Sentry.init()` should act when an app calls it
more than once. Use it when you add or change an `init()` in any SDK.

## The rule

> One active client per `init()` target. The first `init()` wins. A later
> `init()` changes nothing, returns the active client, and warns. To
> reconfigure, call `close()` first.

"Active" means a client is bound to the current scope and is not closed.
`Sentry.close()` closes the client and unbinds it, so a later `init()` sets
up a new client. Other scopes can still hold the closed client (for example,
when `close()` runs inside a request, or when code calls `client.close()`
directly), so a check for "already initialized" must not use `getClient()`
alone.

A repeated `init()` is not supported. Until the next major version, most
SDKs still replace the client (see below). Do not depend on that.

## Why

When `init()` replaces a client, nothing closes the old one:

- Buffered logs, metrics, spans, client reports, and flush timers stay on
  the old client.
- `setupOnce` runs only for the first client, because the list of
  installed integrations is global. The result mixes settings from both
  calls.
- `initialScope` merges into the current scope on each call.

"First wins" never gives a user half of one config and half of another.

## Current behavior

| Entry point                                                               | Repeated call                                                                                                                                                         |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initAndBind` (browser and its wrappers, Deno), Node `_init`, Vercel Edge | Warns, then replaces the client. Returns the new client.                                                                                                              |
| Next.js server, Remix server, Hono Node                                   | Keeps the first client and returns it. Logs in debug mode only.                                                                                                       |
| Hono Bun and Deno                                                         | Keeps the first client and returns it. Warns with its own text.                                                                                                       |
| Nuxt server                                                               | Keeps the first client and returns it. Logs that a `--import` preload is no longer needed.                                                                            |
| Cloudflare (default)                                                      | Keeps the first client of the isolate and returns it, unless that client is closed or closing. `cacheClient: false` makes a new client on each call, with no warning. |
| Next.js edge                                                              | Warns, then replaces the client. Returns `void`.                                                                                                                      |

The shared warning lives in `warnIfClientIsActive()` in
`packages/core/src/sdk.ts`. Core exports it as
`_INTERNAL_warnIfClientIsActive` for SDKs that build their client without
`initAndBind`.

A wrapper that expects a repeated call, such as a server bundle and a
`--import` preload that both run the config, keeps its own guard and
returns early. The shared warning then does not show. Guards use
`getActiveClient()` (exported as `_INTERNAL_getActiveClient`), which
returns the bound client only if it is not closed.

## TODO(v12): Plan for the next major version

1. Move the "first wins" guard into `initAndBind`, Node's `_init`, and
   Vercel Edge's `init`. Remove the guards in each wrapper.
2. Switch browser to "first wins". For two apps on one page, point users
   to separate clients that are not bound with `init()` (see #24883).
3. Make Next.js edge return the client.

## Tests

A test that calls `init()` again without a reset now prints the warning.
Reset between tests with one of these:

- `getCurrentScope().setClient(undefined)`, or a helper that clears the
  carrier (`getMainCarrier().__SENTRY__ = undefined`).
- `await Sentry.close()`. This also flushes, so it is slower.

The warning goes through `consoleSandbox`, which calls the method stored
in `originalConsoleMethods`. To assert on it, replace
`originalConsoleMethods.warn` with a mock. A spy on `console.warn` misses
it once the console integration is set up.
