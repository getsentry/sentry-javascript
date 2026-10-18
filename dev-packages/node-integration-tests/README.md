# Integration Tests for Sentry Node.JS SDK

## Structure

```
suites/
|---- public-api/
      |---- captureMessage/
            |---- test.ts [assertions]
            |---- scenario.ts [Sentry initialization and test subject]
      |---- customTest/
            |---- test.ts [assertions]
            |---- scenario_1.ts [optional extra test scenario]
            |---- scenario_2.ts [optional extra test scenario]
            |---- server_with_mongo.ts [optional custom server]
            |---- server_with_postgres.ts [optional custom server]
```

The tests are grouped by their scopes, such as `public-api` or `tracing`. In every group of tests, there are multiple
folders containing test scenarios and assertions.

`scenario.ts` contains the initialization logic and the test subject. By default, `{TEST_DIR}/scenario.ts` is used, but
`runServer` also accepts an optional `scenarioPath` argument for non-standard usage.

`test.ts` is required for each test case, and contains the server runner logic, request interceptors for Sentry
requests, and assertions. Test server, interceptors and assertions are all run on the same Vitest thread.

### Utilities

`utils/` contains helpers and Sentry-specific assertions that can be used in (`test.ts`).

Nock interceptors are internally used to capture envelope requests by `getEnvelopeRequest` and
`getMultipleEnvelopeRequest` helpers. After capturing required requests, the interceptors are removed. Nock can manually
be used inside the test cases to intercept requests but should be removed before the test ends, as not to cause
flakiness.

### Collecting streamed spans

Register collectors before starting the scenario. `collectStreamedSpansUntilSegment` collects spans across envelopes
until it sees a segment matching a name or predicate, then returns the collected spans from that trace:

```ts
const runner = createRunner(__dirname, 'scenario.ts');
const spansPromise = runner.collectStreamedSpansUntilSegment('main');

await runner.start().completed();

const spans = await spansPromise;
expect(spans.filter(span => !span.is_segment)).toHaveLength(2);
```

A segment does not guarantee that all its children have arrived. If a scenario sends children later, use
`collectStreamedSpans` with a predicate describing which spans must be present:

```ts
const spansPromise = runner.collectStreamedSpans(
  spans => spans.some(span => span.is_segment && span.name === 'main') && spans.length >= 3,
);
```

The predicate is evaluated separately for each trace. Returning `false` keeps waiting; throwing fails the runner
immediately, including in unordered mode. Keep assertions after collection so incorrect attributes produce assertion
failures. A predicate that never matches still fails on scenario exit or timeout. Neither helper waits for spans
arriving after its condition is satisfied.

## Other Runtimes

`dev-packages/bun-integration-tests` and `dev-packages/deno-integration-tests` run every suite of this package on Bun
and Deno as well. When you add a suite, check that it passes on both. If it cannot, add it to
`node-suites/excludes.ts` of the runtime's package with the reason, or run the single tests that fail only on the
other runtimes, for example `test.runIf(supports({ runtimes: ['node', 'deno'] }))` for a test that fails on Bun. A
suite or test that fails only on Bun versions older than a given one runs with `supports({ bunMin: '1.4.0' })`.

## Running Tests Locally

Tests can be run locally with:

`yarn test`

To run tests with Vitest's watch mode:

`yarn test:watch`

To filter tests by their title:

`yarn test -t "set different properties of a scope"`

## Debugging Tests

To enable verbose logging during test execution, set the `DEBUG` environment variable:

`DEBUG=1 yarn test`

When `DEBUG` is enabled, the test runner will output:

- Test scenario startup information (path, flags, DSN)
- Docker Compose output when using `withDockerCompose`
- Child process stdout and stderr output
- HTTP requests made during tests
- Process errors and exceptions
- Line-by-line output from test scenarios

This is particularly useful when debugging failing tests or understanding the test execution flow.
