# New User Friendly API

Thoughts we had while experimenting with tracing

## Goals

1. Update `withScope` and scope management to use new `ScopeManager` ideas
2.

## Context

- ContextManager (call this for now until we figure out how to combine with Scope)
- ContextManager is set on the client
  - This is ok because there is always a way to figure out the current client
  - Have something like `client.withScope()`?
- We decided not to use a global Context singleton like `@opentelemetry/api` (we can take shortcuts here)
- Client makes the decision on default context manager to use on construction (for ex. If it detects Zone, it uses ZoneManager)

- `hub.withScopeV2()` -> calls `client.withScope()` (step 2)
  - If there is a hub, `getCurrentHub()?.getClient()`

### Tests:

- Nested with


## OpenTelemetry

BaseTraceProvider - https://github.com/open-telemetry/opentelemetry-js/blob/7860344eca83449170bafd03fd288e1a3deebacf/packages/opentelemetry-tracing/src/BasicTracerProvider.ts#L55

Registering a global - https://github.com/open-telemetry/opentelemetry-js-api/blob/7441feae07c63f68b3d21bd95b9291aa84f77f87/src/internal/global-utils.ts#L33

Fetch exmaple - https://github.com/open-telemetry/opentelemetry-js/blob/main/examples/tracer-web/examples/fetch/index.js

Sandbox link (opentelemetry fetch js example) -  https://codesandbox.io/s/opentelemetry-api-js-experiment-y9th5

getContextManager - https://github.com/open-telemetry/opentelemetry-js-api/blob/41109c83a9784d689f319f2c5d953b3874c694a3/src/api/context.ts#L90

BaseContextManager - https://github.com/open-telemetry/opentelemetry-js-api/blob/main/src/context/context.ts

- For mobile we want global map (context)
- For web service we don't want

## Open Questions

- Is the context decision stored globally or per client? (or can we find a way around it)

- How to do manual context propagation? (if not using zones and still want to get the right context in a setTimeout)

- Can we have a global scope in addition to a local scope?

- With `Sentry.trace()` how to you tell it to create a `Transaction` vs `Span`?
- What happens if you nest `Transaction`s with `Sentry.trace()`?


- Possible way forward:

1. Improve hub propagation: add Zone support just like with have support for domains in `@sentry/hub`.
2. Add `Sentry.trace` on top of the existing Hub/Scope implementation (with Zone support).


## Unrelated

- Introduce the concept of a Tracer:
  - Hub becomes Tracker + Tracer, eventually that is Tracker (errors/messages/sessions) + Tracer (spans) + Meter (metrics)
    - Can each hub have multiple Tracker, Tracer, Meter?
    - Can we have an generalized sampler then?
    - Then Transport and Client only loads in code based on if Tracker/Tracer/Meter is active or not
  - Tracker, Tracer, Meter all have their own processors
  - Each have their own specific "context", but share hub wide context as well
  - We remove scope -> put everything inside hub?

const hub = new Hub();

hub.startSpan -> hub.tracer.startSpan

hub.captureException -> hub.tracker.captureException

- Hubs have two modes (like sessions):
  - request mode
  - client mode (global singleton hub)
