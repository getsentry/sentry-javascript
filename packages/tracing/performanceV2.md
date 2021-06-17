# New User Friendly API

These are thoughts I had while experimenting with tracing. These are unrelated to the changes of introducing a tracer function.

## Performance

-

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
