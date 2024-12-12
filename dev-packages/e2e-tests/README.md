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
    "test:assert": "pnpm test"
  },
  "dependencies": {
    "@sentry/node": "latest || *"
  }
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
