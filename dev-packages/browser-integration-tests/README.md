# Integration Tests for Sentry Browser SDK

Integration tests for Sentry's Browser SDK use [Playwright](https://playwright.dev/) internally. These tests are run on
latest stable versions of Chromium, Firefox and Webkit.

## Structure

The tests are grouped by their scope such as `breadcrumbs` or `onunhandledrejection`. In every group of tests, there are
multiple folders containing test cases with their optional supporting assets.

Each case group has a default HTML skeleton named `template.hbs`, and also a default initialization script named
`init.js `, which contains the `Sentry.init()` call. These defaults are used as fallbacks when a specific `template.hbs`
or `init.js` is not defined in a case folder.

`subject.js` contains the logic that sets up the environment to be tested. It also can be defined locally and as a group
fallback. Unlike `template.hbs` and `init.js`, it's not required to be defined for a group, as there may be cases that
does not require a subject, instead the logic is injected using `injectScriptAndGetEvents` from `utils/helpers.ts`.

`test.ts` is required for each test case, which contains the assertions (and if required the script injection logic).
For every case, any set of `init.js`, `template.hbs` and `subject.js` can be defined locally, and each one of them will
have precedence over the default definitions of the test group.

To test page multi-page navigations, you can specify additional `page-*.html` (e.g. `page-0.html`, `page-1.html`) files.
These will also be compiled and initialized with the same `init.js` and `subject.js` files that are applied to
`template.hbs/html`. Note: `page-*.html` file lookup **doesn not** fall back to the parent directories, meaning that
page files have to be directly in the `test.ts` directory.

```
suites/
|---- breadcrumbs/
      |---- template.hbs [fallback template for breadcrumb tests]
      |---- init.js [fallback init for breadcrumb tests]
      |---- subject.js [optional fallback subject for breadcrumb tests]
      |---- click_event_tree/
            |---- template.hbs [optional case specific template]
            |---- init.js [optional case specific init]
            |---- subject.js [optional case specific subject]
            |---- test.ts [assertions]
            |---- page-*.html [optional, NO fallback!]
```

## Writing Tests

### Helpers

`utils/helpers.ts` contains helpers that could be used in assertions (`test.ts`). These helpers define a convenient and
reliable API to interact with Playwright's native API. It's highly recommended to define all common patterns of
Playwright usage in helpers.

### Fixtures

[Fixtures](https://playwright.dev/docs/api/class-fixtures) allows us to define the globals and test-specific information
in assertion groups (`test.ts` files). In it's current state, `fixtures.ts` contains an extension over the pure version
of `test()` function of Playwright. All the tests should import `sentryTest` function from `utils/fixtures.ts` instead
of `@playwright/test` to be able to access the extra fixtures.

## Running Tests Locally

Tests can be run locally using the latest version of Chromium with:

`yarn test`

To run tests with a different browser such as `firefox` or `webkit`:

`yarn test --project='firefox'` `yarn test --project='webkit'`

Or to run on all three browsers:

`yarn test:all`

To filter tests by their title:

`yarn test -g "XMLHttpRequest without any handlers set"`

You can refer to [Playwright documentation](https://playwright.dev/docs/test-cli) for other CLI options.

You can set env variable `PW_BUNDLE` to set specific build or bundle to test against. Available options: `esm`, `cjs`,
`bundle`, `bundle_min`

### Troubleshooting

Apart from [Playwright-specific issues](https://playwright.dev/docs/troubleshooting), below are common issues that might
occur while writing tests for Sentry Browser SDK.

- #### Flaky Tests

  If a test fails randomly, giving a `Page Closed`, `Target Closed` or a similar error, most of the times, the reason is
  a race condition between the page action defined in the `subject` and the listeners of the Sentry event / request.
  It's recommended to firstly check `utils/helpers.ts` whether if that async logic can be replaced by one of the
  helpers. If not, whether the awaited (or non-awaited on purpose in some cases) Playwright methods can be orchestrated
  by [`Promise.all`](http://mdn.io/promise.all). Manually-defined waiting logic such as timeouts are not recommended,
  and should not be required in most of the cases.

- #### Build Errors

  Before running, a page for each test case is built under the case folder inside `dist`. If a page build is failed,
  it's recommended to check:

  - If both default `template.hbs` and `init.js` are defined for the test group.
  - If a `subject.js` is defined for the test case.
  - If either of `init.js` or `subject.js` contain non-browser code.
  - If the webpack configuration is valid.
