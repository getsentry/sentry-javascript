# Creating a new SDK

While each SDK (e.g. `@sentry/react` or `@sentry/nextjs`) is somewhat unique, we try to follow some general themes when
creating a new SDK.

## Types of SDKs

Broadly speaking, there are three types of SDKs:

1. Browser SDKs (e.g. `@sentry/react` or `@sentry/angular`)
2. Server SDKs (e.g. `@sentry/bun` or `@sentry/node`)
3. Meta SDKs (e.g. `@sentry/nextjs` or `@sentry/sveltekit`) - which cover both Browser & Server

Depending on what type of SDK you are creating, you'll have to include different things.

## General Guidelines

As a rule of thumb, we should follow these two ideas:

1. Whenever possible, instrumentation should work without (or with as little as possible) user configuration.
2. Instrumentation should follow common patterns for a specific platform. No config is always preferred, but if config
   is unavoidable, it should feel as native as possible to users of the given framework.

## 1. Browser SDKs

A purely browser SDK generally should cover the following things:

### 1a. Error Monitoring

We have global error handlers out of the box. However, in many frameworks there are ways for users to capture errors
too, which may lead to them not bubble up to our global handlers. Generally, the goal is that all errors are captured by
Sentry.

Either we should use some hook (e.g. `app.on('error')`) to capture exceptions, or provide composables (e.g. an error
boundary component in React) that users can use in their app to ensure all errors are captured by Sentry.

### 1b. Performance Monitoring

#### Routing Instrumentation

At a minimum, each browser SDK should have **Routing Instrumentation**.

While we have a default `browserTracingIntegration`, this has no access to a router, and is thus only based on URLs. We
should strive to provide a custom `browserTracingIntegration` for SDKs that can leverage the router & routing
information.

Ideally, this means that we can emit pageload & navigation spans with parametrized route names instead of full URLs.

Some of the following concepts may be relevant to your SDK:

- **Redirects**: If possible, we want to skip redirects. This means that if a user navigates to `/`, and this redirects
  the user internally to `/dashboard`, we only want to capture a single `/` navigation/pageload.
- **Route Params**: Routes should be parametrized, which means that instead of `/users/123` we want to capture
  `/users/:id` or similar.
- **Query Params**: Query params should generally be removed from the route.

#### Component Tracking

Additionally, depending on the framework we may also have **Component Tracking**. We may track the duration of component
renders and similar things. These are stretch goals, though, and do not need to be part of an MVP.

## 2. Server SDKs

A purely server SDK generally should cover the following things:

### 2a. Error Monitoring

We have global error handlers out of the box. However, in many frameworks there are ways for users to capture errors
too, which may lead to them not bubbling up to our global handlers. Generally, the goal is that all errors are captured
by Sentry.

Either we should use some hook (e.g. `app.on('error')`) to capture exceptions, or provide composables (e.g.
`setupFastifyErrorHandler(app)`) that user can call.

### 2b. Performance Monitoring

#### Routing Instrumentation

At a minimum, each Node SDK should have **Routing Instrumentation**.

Most SDKs that build on top of `@sentry/node` should automatically have basic `http.server` spans emitted for incoming
requests by the `httpIntegration`. However, these spans do not contain any routing information (e.g. a `http.route`
attribute). A server SDK should make sure to add route information to these spans.

If there are things that should be captured in spans that are not covered by `httpIntegration`, we may need to write our
own instrumentation to capture `http.server` spans.

Some of the following concepts may be relevant to your SDK:

- **Route Params**: Routes should be parametrized, which means that instead of `/users/123` we want to capture
  `/users/:id` or similar.
- **Query Params**: Query params should generally be removed from the route.

#### Middleware Tracking

Additionally, Node SDKs may also do **Middleware Tracking**. If possible, we may want to instrument middlewares, and
create spans for them. These are stretch goals, though, and do not need to be part of an MVP.

### 2c. OPTIONAL: Additional features

We may also want to instrument additional features, if applicable, including:

- Automatic cron instrumentation
- [Cache module](https://docs.sentry.io/product/insights/caches/) - See
  [Instrument Caches](https://docs.sentry.io/platforms/javascript/guides/connect/tracing/instrumentation/custom-instrumentation/caches-module/)
- [Queue module](https://docs.sentry.io/product/insights/queue-monitoring/) - See
  [Instrument Queues](https://docs.sentry.io/platforms/javascript/guides/connect/tracing/instrumentation/custom-instrumentation/queues-module/)

## 3. Meta SDKs

Meta SDKs should contain both the things pointed out in 1. and 2, _PLUS_:

### 3a. Connected Traces

Traces from SSR (server side) should be continued in the client side (browser). Usually this means that we have to
inject the trace data as `<meta>` tags into the rendered HTML pages. If possible, we should do that automatically. If
there is no way to do that automatically, we should provide a utility for users to do it themselves.

### 3b. Instrumented Server Components / API Routes / etc.

Depending on the framework, we should instrument all the pieces that exist in this framework. This includes capturing
errors & spans for things like:

- Server Components
- API Routes
- Layouts
- etc.

When possible, we should auto-capture this. If not possible, we should provide utilities for users to do this
themselves.

### 3c. Bundler Integration / Source Maps

When possible, Meta SDKs should integrate with the used bundler. For example, SvelteKit uses Vite, so we should
automatically set up `@sentry/vite-plugin` for the user. At a minimum, we want to enable source maps upload for the meta
SDK, but this may also include automated release creation and other bundler features.

We _should not_ expose the bundler plugin config directly, because this means that we cannot bump the underlying bundler
plugin version in a major way (because the bundler plugin config becomes public API of the meta SDK). Instead, we should
provide an abstraction layer of options that we expose on top of that.

### 3d. Alternate JS Runtimes

We generally want to support Node runtimes for the server. However, sometimes there may be alternate runtimes that may
be supported, e.g. Cloudflare Workers or Vercel Edge Functions. We generally do not need to support these in an MVP, but
may decide to support them later.
