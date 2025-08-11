import { test as base, expect } from '@playwright/test';
import { App } from 'aws-cdk-lib';
import * as tmp from 'tmp';
import { LocalLambdaStack, SAM_PORT, getHostIp } from '../src/stack.js';
import { writeFileSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { LambdaClient } from '@aws-sdk/client-lambda';

const DOCKER_NETWORK_NAME = 'lambda-test-network';
const SAM_TEMPLATE_FILE = 'sam.template.yml';

export { expect };

export const test = base.extend<{ testEnvironment: LocalLambdaStack; lambdaClient: LambdaClient }>({
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

      const debugLog = tmp.fileSync({ prefix: 'sentry_aws_lambda_tests_sam_debug', postfix: '.log' });
      console.log(`[test_environment fixture] Writing SAM debug log to: ${debugLog.name}`);

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
          stdio: ['ignore', debugLog.fd, debugLog.fd],
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
