import child_process from 'child_process';

child_process.execSync('node ./src/run-lambda.mjs', {
  stdio: 'inherit',
  env: {
    ...process.env,
    // On AWS, LAMBDA_TASK_ROOT is usually /var/task but for testing, we set it to the CWD to correctly apply our handler
    LAMBDA_TASK_ROOT: process.cwd(),
    _HANDLER: 'src/lambda-function.handler',

    NODE_OPTIONS: '--import @sentry/aws-serverless/awslambda-auto',
    SENTRY_DSN: 'http://public@localhost:3031/1337',
    SENTRY_TRACES_SAMPLE_RATE: '1.0',
  },
  cwd: process.cwd(),
});
