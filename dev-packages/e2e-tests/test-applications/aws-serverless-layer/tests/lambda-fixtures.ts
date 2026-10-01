import { test as base, expect } from '@playwright/test';
import { App } from 'aws-cdk-lib';
import { LocalLambdaStack, SAM_PORT, getHostIp } from '../src/stack';
import { writeFileSync } from 'node:fs';
import { type ChildProcess, execSync, spawn } from 'node:child_process';
import { LambdaClient } from '@aws-sdk/client-lambda';

const DOCKER_NETWORK_NAME = 'lambda-test-network';
const SAM_TEMPLATE_FILE = 'sam.template.yml';

// A healthy SAM start takes about 20s on CI, but SAM occasionally hangs on its first start while a
// fresh one comes up in seconds, so give up early and retry instead of waiting out one long timeout.
const SAM_START_TIMEOUT_MS = 90_000;
const SAM_START_ATTEMPTS = 2;
const SAM_OUTPUT_MAX_CHARS = 20_000;

/** Major Node for SAM `--invoke-image`; default matches root `package.json` `volta.node` and `pull-sam-image.sh`. */
const DEFAULT_NODE_VERSION_MAJOR = '20';

const SAM_INSTALL_ERROR =
  'You need to install sam, e.g. run `brew install aws-sam-cli`. Ensure `sam` is on your PATH when running tests.';

export { expect };

export const test = base.extend<{ testEnvironment: LocalLambdaStack; lambdaClient: LambdaClient }>({
  testEnvironment: [
    async ({}, use) => {
      console.log('[testEnvironment fixture] Setting up AWS Lambda test infrastructure');

      const nodeVersionMajor = process.env.NODE_VERSION?.trim() || DEFAULT_NODE_VERSION_MAJOR;
      process.env.NODE_VERSION = nodeVersionMajor;

      assertSamOnPath();

      execSync('docker network prune -f');
      createDockerNetwork();

      const hostIp = await getHostIp();
      const app = new App();

      const stack = new LocalLambdaStack(app, 'LocalLambdaStack', {}, hostIp);
      const template = app.synth().getStackByName('LocalLambdaStack').template;
      writeFileSync(SAM_TEMPLATE_FILE, JSON.stringify(template, null, 2));

      const args = [
        'local',
        'start-lambda',
        '--debug',
        '--port',
        String(SAM_PORT),
        '--template',
        SAM_TEMPLATE_FILE,
        '--warm-containers',
        'EAGER',
        '--docker-network',
        DOCKER_NETWORK_NAME,
        '--skip-pull-image',
        '--invoke-image',
        `public.ecr.aws/lambda/nodejs:${nodeVersionMajor}`,
      ];

      console.log(`[testEnvironment fixture] Running SAM with args: ${args.join(' ')}`);

      let samProcess: ChildProcess | undefined;

      try {
        samProcess = await startSam(args);

        await use(stack);
      } finally {
        console.log('[testEnvironment fixture] Tearing down AWS Lambda test infrastructure');

        if (samProcess) {
          await stopSam(samProcess);
        }
        removeDockerNetwork();
      }
    },
    // Own timeout so slow SAM stack startup does not eat into the first test's budget.
    { scope: 'worker', auto: true, timeout: 300_000 },
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

async function startSam(args: string[]): Promise<ChildProcess> {
  for (let attempt = 1; ; attempt++) {
    let output = '';
    const samProcess = spawn('sam', args, {
      stdio: process.env.DEBUG ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      env: envForSamChild(),
    });
    const collectOutput = (chunk: Buffer): void => {
      output = (output + chunk.toString()).slice(-SAM_OUTPUT_MAX_CHARS);
    };
    samProcess.stdout?.on('data', collectOutput);
    samProcess.stderr?.on('data', collectOutput);

    try {
      await LocalLambdaStack.waitForStack(SAM_START_TIMEOUT_MS);
      return samProcess;
    } catch (error) {
      console.warn(`[testEnvironment fixture] SAM output of failed start attempt ${attempt}:\n${output}`);
      await stopSam(samProcess);

      if (attempt >= SAM_START_ATTEMPTS) {
        throw error;
      }
      console.warn(`[testEnvironment fixture] Restarting SAM (attempt ${attempt + 1}/${SAM_START_ATTEMPTS})`);
    }
  }
}

async function stopSam(samProcess: ChildProcess): Promise<void> {
  if (samProcess.exitCode === null && samProcess.signalCode === null) {
    samProcess.kill('SIGTERM');
    await new Promise(resolve => {
      const timer = setTimeout(() => {
        samProcess.kill('SIGKILL');
        resolve(void 0);
      }, 5000);
      samProcess.once('exit', () => {
        clearTimeout(timer);
        resolve(void 0);
      });
    });
  }

  // A SAM process killed mid-start leaves its runtime containers behind, which would keep the
  // docker network in use and hold on to their ports.
  removeNetworkContainers();
}

/** Avoid forcing linux/amd64 on Apple Silicon when `DOCKER_DEFAULT_PLATFORM` is set globally. */
function envForSamChild(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (process.arch === 'arm64') {
    delete env.DOCKER_DEFAULT_PLATFORM;
  }
  return env;
}

function assertSamOnPath(): void {
  try {
    execSync('sam --version', { encoding: 'utf-8', stdio: 'pipe' });
  } catch {
    throw new Error(SAM_INSTALL_ERROR);
  }
}

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

function removeNetworkContainers() {
  const containerIds = execSync(`docker ps -aq --filter network=${DOCKER_NETWORK_NAME}`, { encoding: 'utf-8' })
    .split('\n')
    .filter(Boolean);
  if (containerIds.length) {
    execSync(`docker rm -f ${containerIds.join(' ')}`, { stdio: 'ignore' });
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
