import child_process from 'child_process';

child_process.execSync('node ./src/run-lambda.mjs', {
  stdio: 'inherit',
  env: {
    ...process.env,
    // On AWS, LAMBDA_TASK_ROOT is usually /var/task but for testing, we set it to the CWD to correctly apply our handler
    LAMBDA_TASK_ROOT: process.cwd(),
    _HANDLER: 'src/lambda-function.handler',

    NODE_OPTIONS: '--import ./src/instrument.mjs',
  },
  cwd: process.cwd(),
});
