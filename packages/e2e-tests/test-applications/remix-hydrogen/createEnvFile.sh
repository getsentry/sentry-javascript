# export environment variables from .env file

# exit if any command fails
set -e

# create environment variables file
cat >./env.ts <<EOF
export const env = {
  SENTRY_DSN: '${E2E_TEST_DSN}',
};
EOF
