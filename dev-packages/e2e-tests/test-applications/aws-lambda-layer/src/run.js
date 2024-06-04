const child_process = require('child_process');

child_process.execSync('node ./src/run-lambda.js', {
  stdio: 'inherit',
  env: {
    ...process.env,
    LAMBDA_TASK_ROOT: '.',
    _HANDLER: 'handle',

    NODE_OPTIONS: '--require @sentry/aws-serverless/dist/awslambda-auto',
    SENTRY_DSN: 'http://public@localhost:3031/1337',
    SENTRY_TRACES_SAMPLE_RATE: '1.0',
    SENTRY_DEBUG: 'true',
  },
  cwd: process.cwd(),
});
