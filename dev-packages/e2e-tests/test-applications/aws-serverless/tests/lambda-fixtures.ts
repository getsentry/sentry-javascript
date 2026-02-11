import { test as base, expect } from '@playwright/test';
import { App } from 'aws-cdk-lib';
import * as tmp from 'tmp';
import { LocalLambdaStack, SAM_PORT, getHostIp } from '../src/stack';
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
      createDockerNetwork();

      const hostIp = await getHostIp();
      const app = new App();

      const stack = new LocalLambdaStack(app, 'LocalLambdaStack', {}, hostIp);
      const template = app.synth().getStackByName('LocalLambdaStack').template;
      writeFileSync(SAM_TEMPLATE_FILE, JSON.stringify(template, null, 2));

      const debugLog = tmp.fileSync({ prefix: 'sentry_aws_lambda_tests_sam_debug', postfix: '.log' });
      if (!process.env.CI) {
        console.log(`[test_environment fixture] Writing SAM debug log to: ${debugLog.name}`);
      }

      const args = [
        'local',
        'start-lambda',
        '--debug',
        '--template',
        SAM_TEMPLATE_FILE,
        '--warm-containers',
        'EAGER',
        '--docker-network',
        DOCKER_NETWORK_NAME,
        '--skip-pull-image',
      ];

      if (process.env.NODE_VERSION) {
        args.push('--invoke-image', `public.ecr.aws/lambda/nodejs:${process.env.NODE_VERSION}`);
      }

      console.log(`[testEnvironment fixture] Running SAM with args: ${args.join(' ')}`);

      const samProcess = spawn('sam', args, {
        stdio: process.env.CI ? 'inherit' : ['ignore', debugLog.fd, debugLog.fd],
      });

      try {
        await LocalLambdaStack.waitForStack();

        await use(stack);
      } finally {
        console.log('[testEnvironment fixture] Tearing down AWS Lambda test infrastructure');

        samProcess.kill('SIGTERM');
        await new Promise(resolve => {
          samProcess.once('exit', resolve);
          setTimeout(() => {
            if (!samProcess.killed) {
              samProcess.kill('SIGKILL');
            }
            resolve(void 0);
          }, 5000);
        });

        removeDockerNetwork();
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

function createDockerNetwork() {
  try {
    execSync(`docker network create --driver bridge ${DOCKER_NETWORK_NAME}`);
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
    if (stderr.includes('already exists')) {
      console.log(`[testEnvironment fixture] Reusing existing docker network ${DOCKER_NETWORK_NAME}`);
      return;
    }
    throw error;
  }
}

function removeDockerNetwork() {
  try {
    execSync(`docker network rm ${DOCKER_NETWORK_NAME}`);
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
    if (!stderr.includes('No such network')) {
      console.warn(`[testEnvironment fixture] Failed to remove docker network ${DOCKER_NETWORK_NAME}: ${stderr}`);
    }
  }
}
