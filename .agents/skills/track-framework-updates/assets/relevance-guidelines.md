# Release & Blog Post Relevance Guidelines

Use these rules to classify each individual change within a release, blog post, or RFC as `high`, `medium`, or `low` relevance to the Sentry JavaScript SDK. A single release typically contains multiple changes — classify each one independently, then group them by relevance level in the output.

## Context

The Sentry JavaScript SDK instruments web frameworks and libraries by:

- Hooking into **routers** to create transactions and navigation spans
- Wrapping **lifecycle hooks, middleware, and plugin systems** to attach tracing and error capture
- Intercepting **error boundaries and error handlers** to report exceptions
- Propagating **trace context** across async boundaries using `AsyncLocalStorage`, `executionAsyncId`, or framework-specific isolation mechanisms
- Patching or wrapping **module exports** (via OpenTelemetry instrumentation hooks or monkey-patching) — dependent on the framework's ESM/CJS `exports` map
- Providing **build-time plugins** (Vite, Webpack, Rollup) that inject source-map uploads, release metadata, and tree-shaking hints
- Creating **component-level spans** from rendering pipelines (concurrent rendering, hydration, streaming)

A change is relevant when it touches any surface the SDK depends on, extends, or could newly instrument.

## Classification rules

### Classify as `high` when the change does ANY of the following:

- Adds, removes, renames, or changes the signature of a router, route matcher, or navigation API
- Adds, removes, renames, or changes lifecycle hooks, middleware signatures, or plugin/extension registration
- Modifies SSR, streaming, hydration, or server-handler behavior
- Changes error-handling, error-boundary, or diagnostic-channel APIs
- Introduces a new public API or framework primitive that performs I/O, triggers side effects, or orchestrates rendering (these are instrumentation candidates)
- Changes async-context propagation, request-isolation, or scoping mechanisms (`AsyncLocalStorage` usage, domain-like scoping, `executionAsyncId`)
- Removes, renames, or changes the signature of any internal API that the Sentry SDK currently wraps or patches
- Changes the module system: ESM/CJS dual-package mode, `package.json` `exports` map, conditional exports
- Deprecates an API that the Sentry SDK currently uses
- Changes the shape of request, response, context, or middleware objects the SDK reads from (headers, status codes, route params)
- Changes build tooling or bundler plugin APIs in ways that affect source maps, tree-shaking, or bundle integration (Vite plugin API, Webpack loader API, Rollup plugin hooks)
- Adds a new deployment target (edge runtime, serverless adapter, Workers) that the SDK does not yet support
- Changes how the framework emits or consumes OpenTelemetry spans
- Changes the rendering pipeline (concurrent rendering, partial pre-rendering, resumability, Suspense boundaries) in ways that alter component lifecycle timing
- Introduces framework-level telemetry, diagnostics hooks, or DevTools protocol changes that could replace or improve current SDK instrumentation

### Classify as `medium` when the change does ANY of the following (but none of the `high` criteria):

- Adds an experimental, unstable, or feature-flagged API — this signals a future `high` item once stabilized
- Changes peer-dependency version ranges — can cause version conflicts for SDK users
- Introduces a new data-fetching pattern, caching strategy, or loader API that does not yet have SDK span coverage
- Changes HTTP client, `fetch` wrapper, or outgoing-request handling within the framework
- Changes the worker, thread, or sub-process model

### Classify as `low` when ALL the following are true:

- The change does not match any `high` or `medium` criterion above
- The change is limited to: documentation, typos, README updates, internal refactors with no public API or behavioral change, test-only changes, CI/CD pipeline changes, new examples/starter templates (unless they demonstrate a new architectural pattern), community or governance changes, contributor guidelines, dependency bumps (unless bumping a transitive dependency the SDK also depends on), or performance optimizations that do not alter API surface or behavior contracts

## Grouping

A single release will produce items across multiple relevance levels. In the output, list all items classified as `high` under a `high` heading, all `medium` items under a `medium` heading, and all `low` items under a `low` heading. Omit a heading if it has no items.

## Handling edge cases

- When you are uncertain whether a change is `high` or `medium`, classify it as `high` — false positives cost less than missed breakage.
- When a changelog entry is too vague to classify (e.g., "internal improvements"), classify as `low` unless the diff or linked PR indicates otherwise.
