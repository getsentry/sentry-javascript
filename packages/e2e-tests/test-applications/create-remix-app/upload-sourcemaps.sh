export SENTRY_AUTH_TOKEN=${E2E_TEST_AUTH_TOKEN}

sentry-upload-sourcemaps --org ${E2E_TEST_SENTRY_ORG_SLUG} --project ${E2E_TEST_SENTRY_TEST_PROJECT}
