# E2E Tests

E2E tests enable us to verify the behavior of the packages in this repository as if they were to be published in their
current state.

## How to run

Prerequisites: Docker

- Copy `.env.example` to `.env`
- OPTIONAL: Fill in auth information in `.env` for an example Sentry project - you only need this to run E2E tests that
  send data to Sentry.
- Run `yarn build:tarball` in the root of the repository (needs to be rerun after every update in /packages for the
  changes to have effect on the tests).

To finally run all of the tests:

```bash
yarn test:e2e
```

Or run only a single E2E test app:

```bash
yarn test:run <app-name>
```

Or you can run a single E2E test app with a specific variant:

```bash
yarn test:run <app-name> --variant <variant-name>
```

Variant name matching is case-insensitive and partial. For example, `--variant 13` will match `nextjs-pages-dir (next@13)` if a matching variant is present in the test app's `package.json`.

### Using the Makefile

Alternatively, you can use the provided Makefile for an interactive test selection experience:

**Prerequisites**: Install `fzf` with Homebrew:

```bash
brew install fzf
```

**Run tests interactively**:

```bash
make run
```

This will display a fuzzy-finder menu of all available test applications. Select one to run it automatically.

**List all test applications**:

```bash
make list
```

For example, if you have the following variants in your test app's `package.json`:

```json
"sentryTest": {
  "variants": [
    {
      "build-command": "pnpm test:build-13",
      "label": "nextjs-pages-dir (next@13)"
    },
    {
      "build-command": "pnpm test:build-13-canary",
      "label": "nextjs-pages-dir (next@13-canary)"
    },
    {
      "build-command": "pnpm test:build-15",
      "label": "nextjs-pages-dir (next@15)"
    }
  ]
}
```

If you run `yarn test:run nextjs-pages-dir --variant 13`, it will match against the very first matching variant, which is `nextjs-pages-dir (next@13)`. If you need to target the second variant in the example, you need to be more specific and use `--variant 13-canary`.

## How they work

Before running any tests we launch a fake test registry (in our case [Verdaccio](https://verdaccio.org/docs/e2e/)), we
build our packages, pack them, and publish them to the fake registry. The fake registry is hosted in a Docker container,
and the script to publish the packages is also run from within a container to ensure that the fake publishing happens
with the same Node.js and npm versions as we're using in CI.

After publishing our freshly built packages to the fake registry, the E2E test script will look for `test-recipe.json`
files in test applications located in the `test-applications` folder. In this folder, we keep standalone test
applications, that use our SDKs and can be used to verify their behavior. The `test-recipe.json` recipe files contain
information on how to build the test applications and how to run tests on these applications.

## How to set up a new test

Test applications are completely standalone applications that can be used to verify our SDKs. To set one up, follow
these commands:

```sh
cd dev-packages/e2e-tests

# Create a new test application folder
mkdir test-applications/my-new-test-application # Name of the new folder doesn't technically matter but choose something meaningful

# Create an npm configuration file that uses the fake test registry
cat > test-applications/my-new-test-application/.npmrc << EOF
@sentry:registry=http://127.0.0.1:4873
@sentry-internal:registry=http://127.0.0.1:4873
EOF
```

Make sure to add a `test:build` and `test:assert` command to the new app's `package.json` file.

### The `.npmrc` File

Every test application needs an `.npmrc` file (as shown above) to tell pnpm to fetch `@sentry/*` and `@sentry-internal/*` packages from the local Verdaccio registry. Without it, pnpm will install from the public npm registry and your local changes won't be tested - this is one of the most common causes of confusing test failures.

To verify packages are being installed from Verdaccio, check the version in `node_modules/@sentry/*/package.json`. If it shows something like `0.0.0-pr.12345`, Verdaccio is working. If it shows a released version (e.g., `8.0.0`), the `.npmrc` is missing or incorrect.

## Troubleshooting

### Common Issues

#### Tests fail with "Cannot find module '@sentry/...'" or use wrong package version

1. Verify the test application has an `.npmrc` file (see above)
2. Rebuild tarballs: `yarn build && yarn build:tarball`
3. Delete `node_modules` in the test application and re-run the test

#### Docker/Verdaccio issues

- Ensure Docker daemon is running
- Check that port 4873 is not already in use: `lsof -i :4873`
- Stop any existing Verdaccio containers: `docker ps` and `docker stop <container-id>`
- Check Verdaccio logs for errors

#### Tests pass locally but fail in CI (or vice versa)

- Most likely cause: missing `.npmrc` file
- Verify all `@sentry/*` dependencies use `latest || *` version specifier
- Check if the test relies on environment-specific behavior

### Debugging Tips

1. **Enable Sentry debug mode**: Add `debug: true` to the Sentry init config to see detailed SDK logs
2. **Check browser console**: Look for SDK initialization errors or warnings
3. **Inspect network requests**: Verify events are being sent to the expected endpoint
4. **Check installed versions**: `cat node_modules/@sentry/browser/package.json | grep version`

## Bundler-Specific Behavior

Different bundlers handle environment variables and code replacement differently. This is important when writing tests or SDK code that relies on build-time constants.

### Webpack

- `DefinePlugin` replaces variables in your application code
- **Does NOT replace values inside `node_modules`**
- Environment variables must be explicitly defined

### Vite

- `define` option replaces variables in your application code
- **Does NOT replace values inside `node_modules`**
- `import.meta.env.VITE_*` variables are replaced at build time
- For replacing values in dependencies, use `@rollup/plugin-replace`

### Next.js

- Automatically injects `process.env` via webpack/turbopack
- Handles environment variables more seamlessly than raw webpack/Vite
- Server and client bundles may have different environment variable access

### `import.meta.env` Considerations

- Only available in Vite and ES modules
- Webpack and Turbopack do not have `import.meta.env`
- SDK code accessing `import.meta.env` must use try-catch to handle environments where it doesn't exist

```typescript
// Safe pattern for SDK code
let envValue: string | undefined;
try {
  envValue = import.meta.env.VITE_SOME_VAR;
} catch {
  // import.meta.env not available in this bundler
}
```

Test apps in the folder `test-applications` will be automatically picked up by CI in the job `job_e2e_tests` (in `.github/workflows/build.yml`).
The test matrix for CI is generated in `dev-packages/e2e-tests/lib/getTestMatrix.ts`.

For each test app, CI checks its dependencies (and devDependencies) to see if any of them have changed in the current PR (based on nx affected projects).
For example, if something is changed in the browser package, only E2E test apps that depend on browser will run, while others will be skipped.

You can add additional information about the test (e.g. canary versions, optional in CI) by adding `sentryTest` in the `package.json`
of a test application.

**An important thing to note:** In the context of the build/test commands the fake test registry is available at
`http://127.0.0.1:4873`. It hosts all of our packages as if they were to be published with the state of the current
branch. This means we can install the packages from this registry via the `.npmrc` configuration as seen above. If you
add Sentry dependencies to your test application, you should set the dependency versions set to `latest || *` in order
for it to work with both regular and prerelease versions:

```jsonc
// package.json
{
  "name": "my-new-test-application",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "echo \"Hello world!\"",
    "test:build": "pnpm install",
    "test:assert": "pnpm test",
  },
  "dependencies": {
    "@sentry/node": "latest || *",
  },
}
```

All that is left for you to do now is to create a test app and run `yarn test:e2e`.

## Standardized Test Apps

For some of our E2E tests we define a standard for test applications as to how they should look and behave. Standardized
test apps enables us to reuse the same test suite over a number of different frameworks/SDKs.

### Standardized Frontend Test Apps

TODO: This is not up to date.

A standardized frontend test application has the following features:

- Just for the sake of consistency we prefix the standardized frontend tests with `standard-frontend-`. For example
  `standard-frontend-nextjs`.
- A page at path `/`
  - Having a `<input type="button" id="exception-button">` that captures an Exception when clicked. The returned
    `eventId` from the `Sentry.captureException()` call must be written to `window.capturedExceptionId`. It does not
    matter what the captured error looks like.
  - Having an link with `id="navigation"` that navigates to `/user/5`. It doesn't have to be an `<a>` tag, for example
    if a framework has another way of doing routing, the important part is that the element to click for navigation has
    the correct `id`. Text of the link doesn't matter.
- An empty page at `/user/5`
- Apps should write all pageload and navigation transaction IDs into an array at `window.recordedTransactions`. This can
  be done with an event processor:

  ```ts
  Sentry.addEventProcessor(event => {
    if (
      event.type === 'transaction' &&
      (event.contexts?.trace?.op === 'pageload' || event.contexts?.trace?.op === 'navigation')
    ) {
      const eventId = event.event_id;
      window.recordedTransactions = window.recordedTransactions || [];
      window.recordedTransactions.push(eventId);
    }

    return event;
  });
  ```

### Standardized Backend Test Apps

TBD

### Standardized Frontend-to-Backend Test Apps

A standardized Meta-Framework test application has the following features:

- Has a parameterized backend API route `/user/:id` that returns a JSON object with the user ID.
- Has a parameterized frontend page (can be SSR) `/user/:id` that fetches the user data on the client-side from the API route and displays it.

This setup creates the scenario where the frontend page loads, and then immediately makes an API request to the backend API.

The following test cases for connected tracing should be implemented in the test app:

- Capturing a distributed page load trace when a page is loaded
  - The HTML meta-tag should include the Sentry trace data and baggage
  - The server root span should be the parent of the client pageload span
  - All routes (server and client) should be parameterized, e.g. `/user/5` should be captured as `/user/:id` route
- Capturing a distributed trace when requesting the API from the client-side
  - There should be three transactions involved: the client pageload, the server "pageload", and the server API request
  - The client pageload should include an `http.client` span that is the parent of the server API request span
  - All three transactions and the `http.client` span should share the same `trace_id`
  - All `transaction` names and the `span` description should be parameterized, e.g. `/user/5` should be captured as `/user/:id` route
