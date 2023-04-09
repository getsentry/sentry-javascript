/* eslint-disable no-console */

export function validate(): boolean {
  let missingEnvVar = false;

  if (!process.env.E2E_TEST_AUTH_TOKEN) {
    console.log(
      "No auth token configured! Please configure the E2E_TEST_AUTH_TOKEN environment variable with an auth token that has the scope 'project:read'!",
    );
    missingEnvVar = true;
  }

  if (!process.env.E2E_TEST_DSN) {
    console.log('No DSN configured! Please configure the E2E_TEST_DSN environment variable with a DSN!');
    missingEnvVar = true;
  }

  if (!process.env.E2E_TEST_SENTRY_ORG_SLUG) {
    console.log(
      'No Sentry organization slug configured! Please configure the E2E_TEST_SENTRY_ORG_SLUG environment variable with a Sentry organization slug!',
    );
    missingEnvVar = true;
  }

  if (!process.env.E2E_TEST_SENTRY_TEST_PROJECT) {
    console.log(
      'No Sentry project configured! Please configure the E2E_TEST_SENTRY_TEST_PROJECT environment variable with a Sentry project slug!',
    );
    missingEnvVar = true;
  }

  return !missingEnvVar;
}
