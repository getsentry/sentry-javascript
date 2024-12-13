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
requests, and assertions. Test server, interceptors and assertions are all run on the same Jest thread.

### Utilities

`utils/` contains helpers and Sentry-specific assertions that can be used in (`test.ts`).

Nock interceptors are internally used to capture envelope requests by `getEnvelopeRequest` and
`getMultipleEnvelopeRequest` helpers. After capturing required requests, the interceptors are removed. Nock can manually
be used inside the test cases to intercept requests but should be removed before the test ends, as not to cause
flakiness.

## Running Tests Locally

Tests can be run locally with:

`yarn test`

To run tests with Jest's watch mode:

`yarn test:watch`

To filter tests by their title:

`yarn test -t "set different properties of a scope"`

You can refer to [Jest documentation](https://jestjs.io/docs/cli) for other CLI options.
