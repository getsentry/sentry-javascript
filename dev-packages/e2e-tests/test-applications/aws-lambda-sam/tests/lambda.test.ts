import { test as base, expect } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { App } from 'aws-cdk-lib';
import { LocalLambdaStack, SAM_PORT, getHostIp } from '../stack.js';
import { writeFileSync, openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

const DOCKER_NETWORK_NAME = 'lambda-test-network';
const SAM_TEMPLATE_FILE = 'sam.template.yml';

const test = base.extend<{ testEnvironment: LocalLambdaStack; lambdaClient: LambdaClient }>({
  testEnvironment: [
    async ({}, use) => {
      console.log('[testEnvironment fixture] Setting up AWS Lambda test infrastructure');

      execSync('docker network prune -f');
      execSync(`docker network create --driver bridge ${DOCKER_NETWORK_NAME}`);

      const hostIp = await getHostIp();
      const app = new App();

      const stack = new LocalLambdaStack(app, 'LocalLambdaStack', {}, hostIp);
      const template = app.synth().getStackByName('LocalLambdaStack').template;
      writeFileSync(SAM_TEMPLATE_FILE, JSON.stringify(template, null, 2));

      const debugLogFile = path.join(tmpdir(), 'sentry_aws_lambda_tests_sam_debug.log');
      const debugLogFd = openSync(debugLogFile, 'w');
      console.log(`[test_environment fixture] Writing SAM debug log to: ${debugLogFile}`);

      const process = spawn(
        'sam',
        [
          'local',
          'start-lambda',
          '--debug',
          '--template',
          SAM_TEMPLATE_FILE,
          '--warm-containers',
          'EAGER',
          '--docker-network',
          DOCKER_NETWORK_NAME,
        ],
        {
          stdio: ['ignore', debugLogFd, debugLogFd],
        },
      );

      try {
        await LocalLambdaStack.waitForStack();

        await use(stack);
      } finally {
        console.log('[testEnvironment fixture] Tearing down AWS Lambda test infrastructure');

        process.kill('SIGTERM');
        await new Promise(resolve => {
          process.once('exit', resolve);
          setTimeout(() => {
            if (!process.killed) {
              process.kill('SIGKILL');
            }
            resolve(void 0);
          }, 5000);
        });
      }
    },
    { scope: 'worker', auto: true },
  ],
  lambdaClient: async ({}, use) => {
    const lambdaClient = new LambdaClient({
      endpoint: `http://127.0.0.1:${SAM_PORT}`,
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'dummy',
        secretAccessKey: 'dummy',
      },
    });

    await use(lambdaClient);
  },
});

test.describe('Lambda layer', () => {
  test('CJS', async ({ lambdaClient }) => {
    const transactionEventPromise = waitForTransaction('aws-serverless-lambda-sam', transactionEvent => {
      return transactionEvent?.transaction === 'CjsLayer';
    });

    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'CjsLayer',
        Payload: JSON.stringify({}),
      }),
    );

    const transactionEvent = await transactionEventPromise;

    expect(transactionEvent.type).toEqual('transaction');
    expect(transactionEvent.transaction).toEqual('CjsLayer');
    expect(transactionEvent.sdk?.name).toEqual('sentry.javascript.aws-serverless');
    expect(transactionEvent.contexts?.trace?.origin).toEqual('auto.otel.aws-lambda');
    expect(transactionEvent.contexts?.trace?.op).toEqual('function.aws.lambda');
    expect(transactionEvent.spans).toHaveLength(0);
  });

  test('ESM', async ({ lambdaClient }) => {
    const transactionEventPromise = waitForTransaction('aws-serverless-lambda-sam', transactionEvent => {
      return transactionEvent?.transaction === 'EsmLayer';
    });

    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'EsmLayer',
        Payload: JSON.stringify({}),
      }),
    );

    const transactionEvent = await transactionEventPromise;

    expect(transactionEvent.type).toEqual('transaction');
    expect(transactionEvent.transaction).toEqual('EsmLayer');
    expect(transactionEvent.sdk?.name).toEqual('sentry.javascript.aws-serverless');
    expect(transactionEvent.contexts?.trace?.origin).toEqual('auto.otel.aws-lambda');
    expect(transactionEvent.contexts?.trace?.op).toEqual('function.aws.lambda');
    expect(transactionEvent.spans).toHaveLength(0);
  });
});

test.describe('NPM package', () => {
  test('CJS', async ({ lambdaClient }) => {
    const transactionEventPromise = waitForTransaction('aws-serverless-lambda-sam', transactionEvent => {
      return transactionEvent?.transaction === 'CjsNpm';
    });

    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'CjsNpm',
        Payload: JSON.stringify({}),
      }),
    );

    const transactionEvent = await transactionEventPromise;

    expect(transactionEvent.type).toEqual('transaction');
    expect(transactionEvent.transaction).toEqual('CjsNpm');
    expect(transactionEvent.sdk?.name).toEqual('sentry.javascript.aws-serverless');
    expect(transactionEvent.contexts?.trace?.origin).toEqual('auto.otel.aws-lambda');
    expect(transactionEvent.contexts?.trace?.op).toEqual('function.aws.lambda');
    expect(transactionEvent.spans).toHaveLength(0);
  });

  test('ESM', async ({ lambdaClient }) => {
    const transactionEventPromise = waitForTransaction('aws-serverless-lambda-sam', transactionEvent => {
      return transactionEvent?.transaction === 'EsmNpm';
    });

    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: 'EsmNpm',
        Payload: JSON.stringify({}),
      }),
    );

    const transactionEvent = await transactionEventPromise;

    expect(transactionEvent.type).toEqual('transaction');
    expect(transactionEvent.transaction).toEqual('EsmNpm');
    expect(transactionEvent.sdk?.name).toEqual('sentry.javascript.aws-serverless');
    expect(transactionEvent.contexts?.trace?.origin).toEqual('auto.otel.aws-lambda');
    expect(transactionEvent.contexts?.trace?.op).toEqual('function.aws.lambda');
    expect(transactionEvent.spans).toHaveLength(0);
  });
});
