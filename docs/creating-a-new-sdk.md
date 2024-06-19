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

a. Whenever possible, instrumentation should work without (or with as little as possible) user configuration. b.
Instrumentation should follow common patterns for a specific platform. No config is always preferred, but if config is
unavoidable, it should feel reasonable to users of the given framework.

## 1. Browser SDKs

A purely browser SDK generally should cover the following things:

### 1a. Routing Instrumentation

While we have a default `browserTracingIntegration`, this has no access to a router, and is thus only based on URLs. We
should strive to provide a custom `browserTracingIntegration` for SDKs that can leverage the router & routing
information.

Ideally, this means that we can emit pageload & navigation spans with parametrized route names instead of full URLs.

### 1b. Error Capturing

We have global error handlers out of the box. However, in many frameworks there are ways for users to capture errors
too, which may lead to them not bubble up to our global handlers. Generally, the goal is that all errors are captured by
Sentry.

Either we should use some hook (e.g. `app.on('error')`) to capture exceptions, or provide composables (e.g. an error
boundary component in React) that users can use in their app to ensure all errors are captured by Sentry.

### 1c. OPTIONAL: Component Tracking

Optionally, we may also track  the duration of component renders and similar things. These are stretch goals, though, and do not need to
be part of an MVP.

## 2. Server SDKs

A purely server SDK generally should cover the following things:

### 2a. `http.server` spans with route information

Most SDKs that build on top of `@sentry/node` should automatically have basic `http.server` spans emitted for incoming requests by the
`httpIntegration`. However, these spans do not contain any routing information (e.g. a `http.route` attribute). A server
SDK should make sure to add route information to these spans.

If there are things that should be captured in spans that are not covered by `httpIntegration`, we may need to write our
own instrumentation to capture `http.server` spans.

### 2b. Error Capturing

We have global error handlers out of the box. However, in many frameworks there are ways for users to capture errors
too, which may lead to them not bubble up to our global handlers. Generally, the goal is that all errors are captured by
Sentry.

Either we should use some hook (e.g. `app.on('error')`) to capture exceptions, or provide composables (e.g.
`setupFastifyErrorHandler(app)`) that user can call.

### 2c. OPTIONAL: Middleware Tracking

If possible, we may want to instrument middlewares, and create spans for them.

### 2d. OPTIONAL: Additional features

We may also want to instrument additional features, if applicable, including:

- Crons
- Cache module

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
