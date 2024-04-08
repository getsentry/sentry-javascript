# New Performance APIs in v8

In v8.0.0, we moved to new performance APIs. These APIs have been introduced in v7, so they can already be used there.
However, in v8 we have removed the old performance APIs, so you have to update your manual instrumentation usage to the
new APIs before updating to v8 of the JavaScript SDKs.

## Why?

In v8 of the JavaScript SDKs, we made the move to base the performance instrumentation of all Node-based SDKs to use
[OpenTelemetry](https://opentelemetry.io/) under the hood. This has been done to better align with the broader
ecosystem, and to allow to use common auto instrumentation packages to be able to cover more ground in the ever-changing
JavaScript landscape.

Since the way that OpenTelemetry works differs from how the SDK used to work, this required some changes in order to be
compatible.

Note that for Browser- or Edge-based SDKs, we are not (yet) using OpenTelemetry for auto instrumentation. However, in
order to keep the SDKs isomorphic - especially for SDKs for Meta-Frameworks like Next.js, Sveltekit or Remix - we made
the decision to align the performance APIs for all JavaScript-based SDKs.

## The "old" Way of Manual Performance Instrumentation

Previously, there where two key APIs for adding manual performance instrumentation to your applications:

- `startTransaction()`
- `span.startChild()`

This showed the underlying data model that Sentry was originally based on, which is that there is a root **Transaction**
which can have a nested tree of **Spans**.

## The new model: Goodbye Transactions, Hello Spans Everywhere!

In the new model, transactions are conceptually gone. Instead, you will _always_ operate on spans, no matter where in
the tree you are. Note that in the background, spans _may_ still be grouped into a transaction for the Sentry UI.
However, this happens transparently, and from an SDK perspective, all you have to think about are spans.

## Creating Spans

Instead of manually starting & ending transactions and spans, the new model does not differentiate between these two.
Instead, you _always_ use the same APIs to start a new span, and it will automatically either create a new **Root Span**
(which is just a regular span, only that it has no parent, and is thus conceptually roughly similar to a transaction) or
a **Child Span** for whatever is the currently active span.

There are three key APIs available to start spans:

- `startSpan()`
- `startSpanManual()`
- `startInactiveSpan()`

All three span APIs take `StartSpanOptions` as a first argument, which has the following shape:

```ts
interface StartSpanOptions {
  // The only required field - the name of the span
  name: string;
  attributes?: SpanAttributes;
  op?: string;
  scope?: Scope;
  forceTransaction?: boolean;
}
```

### `startSpan()`

This is the most common API that should be used in most circumstances. It will start a new span, make it the active span
for the duration of a given callback, and automatically end it when the callback ends. You can use it like this:

```js
Sentry.startSpan(
  {
    name: 'my-span',
    attributes: {
      attr1: 'my-attribute',
      attr2: 123,
    },
  },
  span => {
    // do something that you want to measure
    // once this is done, the span is automatically ended
  },
);
```

You can also pass an async function:

```js
Sentry.startSpan(
  {
    name: 'my-span',
    attributes: {},
  },
  async span => {
    // do something that you want to measure
    await waitOnSomething();
    // once this is done, the span is automatically ended
  },
);
```

Since `startSpan()` will make the created span the active span, any automatic or manual instrumentation that creates
spans inside of the callback will attach new spans as children of the span we just started.

Note that if an error is thrown inside of the callback, the span status will automatically be set to be errored.

### `startSpanManual()`

This is a variation of `startSpan()` with the only change that it does not automatically end the span when the callback
ends, but you have to call `span.end()` yourself:

```js
Sentry.startSpanManual(
  {
    name: 'my-span',
  },
  span => {
    // do something that you want to measure

    // Now manually end the span ourselves
    span.end();
  },
);
```

In most cases, `startSpan()` should be all you need for manual instrumentation. But if you find yourself in a place
where the automatic ending of spans, for whatever reason, does not work for you, you can use `startSpanManual()`
instead.

This function will _also_ set the created span as the active span for the duration of the callback, and will _also_
update the span status to be errored if there is an error thrown inside of the callback.

### `startInactiveSpan()`

In contrast to the other two methods, this does not take a callback and this does not make the created span the active
span. You can use this method if you want to create loose spans that do not need to have any children:

```js
Sentry.startSpan({ name: 'outer' }, () => {
  const inner1 = Sentry.startInactiveSpan({ name: 'inner1' });
  const inner2 = Sentry.startInactiveSpan({ name: 'inner2' });

  // do something

  // manually end the spans
  inner1.end();
  inner2.end();
});
```

No span will ever be created as a child span of an inactive span.

### Creating a child span of a specific span

You can use the `withActiveSpan` helper to create a span as a child of a specific span:

```js
Sentry.withActiveSpan(parentSpan, () => {
  Sentry.startSpan({ name: 'my-span' }, span => {
    // span will be a direct child of parentSpan
  });
});
```

### Creating a transaction

While in most cases, you shouldn't have to think about creating a span vs. a transaction (just call `startSpan()` and
we'll do the appropriate thing under the hood), there may still be times where you _need_ to ensure you create a
transaction (for example, if you need to see it as a transaction in the Sentry UI). For these cases, you can pass
`forceTransaction: true` to the start-span APIs, e.g.:

```js
const transaction = Sentry.startInactiveSpan({ name: 'transaction', forceTransaction: true });
```

## The Span schema

Previously, spans & transactions had a bunch of properties and methods to be used. Most of these have been removed in
favor of a slimmer, more straightforward API, which is also aligned with OpenTelemetry Spans. You can refer to the table
below to see which things used to exist, and how they can/should be mapped going forward:

| Old name              | Replace with                                                |
| --------------------- | ----------------------------------------------------------- |
| `traceId`             | `spanContext().traceId`                                     |
| `spanId`              | `spanContext().spanId`                                      |
| `parentSpanId`        | `spanToJSON(span).parent_span_id`                           |
| `status`              | `spanToJSON(span).status`                                   |
| `sampled`             | `spanIsSampled(span)`                                       |
| `startTimestamp`      | `startTime` - note that this has a different format!        |
| `tags`                | use attributes, or set tags on the scope                    |
| `data`                | `spanToJSON(span).data`                                     |
| `transaction`         | `getRootSpan(span)`                                         |
| `instrumenter`        | Removed                                                     |
| `finish()`            | `end()`                                                     |
| `end()`               | Same                                                        |
| `setTag()`            | `setAttribute()`, or set tags on the scope                  |
| `setData()`           | `setAttribute()`                                            |
| `setStatus()`         | The signature of this will change in a coming alpha release |
| `setHttpStatus()`     | `setHttpStatus(span, status)`                               |
| `setName()`           | `updateName()`                                              |
| `startChild()`        | Call `Sentry.startSpan()` independently                     |
| `isSuccess()`         | `spanToJSON(span).status === 'ok'`                          |
| `toTraceparent()`     | `spanToTraceHeader(span)`                                   |
| `toContext()`         | Removed                                                     |
| `updateWithContext()` | Removed                                                     |
| `getTraceContext()`   | `spanToTraceContext(span)`                                  |

In addition, a transaction has this API:

| Old name                    | Replace with                                     |
| --------------------------- | ------------------------------------------------ |
| `name`                      | `spanToJSON(span).description`                   |
| `trimEnd`                   | Removed                                          |
| `parentSampled`             | `spanIsSampled(span)` & `spanContext().isRemote` |
| `metadata`                  | Use attributes instead or set on scope           |
| `setContext()`              | Set context on scope instead                     |
| `setMeasurement()`          | `Sentry.setMeasurement()`                        |
| `setMetadata()`             | Use attributes instead or set on scope           |
| `getDynamicSamplingContext` | `getDynamicSamplingContextFromSpan(span)`        |

### Attributes vs. Data vs. Tags vs. Context

In the old model, you had the concepts of **Data**, **Tags** and **Context** which could be used for different things.
However, this has two main downsides: One, it is not always clear which of these should be used when. And two, not all
of these are displayed the same way for transactions or spans.

Because of this, in the new model, there are only **Attributes** to be set on spans anymore. Broadly speaking, they map
to what Data used to be.

If you still really _need_ to set tags or context, you can do so on the scope before starting a span:

```js
Sentry.withScope(scope => {
  scope.setTag('my-tag', 'tag-value');
  Sentry.startSpan({ name: 'my-span' }, span => {
    // do something here
    // span will have the tags from the containing scope
  });
});
```

## Other Notable Changes

In addition to generally changing the performance APIs, there are also some smaller changes that this brings with it.

### Changed `SamplingContext` for `tracesSampler()`

Currently, `tracesSampler()` can receive an arbitrary `SamplingContext` passed as argument. While this is not defined
anywhere in detail, the shape of this context will change in v8. Going forward, this will mostly receive the attributes
of the span, as well as some other relevant data of the span. Some properties we used to (sometimes) pass there, like
`req` for node-based SDKs or `location` for browser tracing, will not be passed anymore.

### No more `undefined` spans

In v7, the performance APIs `startSpan()` / `startInactiveSpan()` / `startSpanManual()` would receive an `undefined`
span if tracing was disabled or the span was not sampled.

In v8, aligning with OpenTelemetry, these will _always_ return a span - _but_ the span may eb a Noop-Span, meaning a
span that is never sent. This means you don't have to guard everywhere in your code anymore for the span to exist:

```ts
Sentry.startSpan((span: Span | undefined) => {
  // previously, in order to be type safe, you had to do...
  span?.setAttribute('attr', 1);
});

// In v8, the signature changes to:
Sentry.startSpan((span: Span) => {
  // no need to guard anymore!
  span.setAttribute('attr', 1);
});
```
