import { Stack, CfnResource, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as dns from 'node:dns/promises';
import { arch, platform } from 'node:process';
import { globSync } from 'glob';

const LAMBDA_FUNCTIONS_DIR = './src/lambda-functions-layer';
const LAMBDA_FUNCTION_TIMEOUT = 10;
const LAYER_DIR = './node_modules/@sentry/aws-serverless/';
export const SAM_PORT = 3001;

/** Match SAM / Docker to this machine so Apple Silicon does not mix arm64 images with an x86_64 template default. */
function samLambdaArchitecture(): 'arm64' | 'x86_64' {
  return arch === 'arm64' ? 'arm64' : 'x86_64';
}

export class LocalLambdaStack extends Stack {
  sentryLayer: CfnResource;

  constructor(scope: Construct, id: string, props: StackProps, hostIp: string) {
    console.log('[LocalLambdaStack] Creating local SAM Lambda Stack');
    super(scope, id, props);

    this.templateOptions.templateFormatVersion = '2010-09-09';
    this.templateOptions.transforms = ['AWS::Serverless-2016-10-31'];

    console.log('[LocalLambdaStack] Add Sentry Lambda layer containing the Sentry SDK to the SAM stack');

    const [layerZipFile] = globSync('sentry-node-serverless-*.zip', { cwd: LAYER_DIR });

    if (!layerZipFile) {
      throw new Error(`[LocalLambdaStack] Could not find sentry-node-serverless zip file in ${LAYER_DIR}`);
    }

    this.sentryLayer = new CfnResource(this, 'SentryNodeServerlessSDK', {
      type: 'AWS::Serverless::LayerVersion',
      properties: {
        ContentUri: path.join(LAYER_DIR, layerZipFile),
        CompatibleRuntimes: ['nodejs18.x', 'nodejs20.x', 'nodejs22.x'],
        CompatibleArchitectures: [samLambdaArchitecture()],
      },
    });

    const dsn = `http://public@${hostIp}:3031/1337`;
    console.log(`[LocalLambdaStack] Using Sentry DSN: ${dsn}`);

    this.addLambdaFunctions(dsn);
  }

  private addLambdaFunctions(dsn: string) {
    console.log(`[LocalLambdaStack] Add all Lambda functions defined in ${LAMBDA_FUNCTIONS_DIR} to the SAM stack`);

    const lambdaDirs = fs
      .readdirSync(LAMBDA_FUNCTIONS_DIR)
      .filter(dir => fs.statSync(path.join(LAMBDA_FUNCTIONS_DIR, dir)).isDirectory());

    for (const lambdaDir of lambdaDirs) {
      const functionName = `Layer${lambdaDir}`;

      if (!process.env.NODE_VERSION) {
        throw new Error('[LocalLambdaStack] NODE_VERSION is not set');
      }

      new CfnResource(this, functionName, {
        type: 'AWS::Serverless::Function',
        properties: {
          Architectures: [samLambdaArchitecture()],
          CodeUri: path.join(LAMBDA_FUNCTIONS_DIR, lambdaDir),
          Handler: 'index.handler',
          Runtime: `nodejs${process.env.NODE_VERSION}.x`,
          Timeout: LAMBDA_FUNCTION_TIMEOUT,
          Layers: [{ Ref: this.sentryLayer.logicalId }],
          Environment: {
            Variables: {
              SENTRY_TRACES_SAMPLE_RATE: 1.0,
              SENTRY_DEBUG: true,
              NODE_OPTIONS: `--import=@sentry/aws-serverless/awslambda-auto`,
              // We only set SENTRY_DSN if not running TunnelNoDsn, because there
              // we want to test that the extension tunnel forwards requests when SENTRY_DSN is missing.
              TUNNEL_TEST_DSN: dsn,
              ...(lambdaDir !== 'TunnelNoDsn' ? { SENTRY_DSN: dsn } : {}),
            },
          },
        },
      });

      console.log(`[LocalLambdaStack] Added Lambda function: ${functionName}`);
    }
  }

  static async waitForStack(timeout = 60000, port = SAM_PORT) {
    const startTime = Date.now();
    const maxWaitTime = timeout;

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`);

        if (response.ok || response.status === 404) {
          console.log(`[LocalLambdaStack] SAM stack is ready`);
          return;
        }
      } catch {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    throw new Error(`[LocalLambdaStack] Failed to start SAM stack after ${timeout}ms`);
  }
}

export async function getHostIp() {
  if (process.env.GITHUB_ACTIONS) {
    const host = await dns.lookup(os.hostname());
    return host.address;
  }

  if (platform === 'darwin' || platform === 'win32') {
    return 'host.docker.internal';
  }

  const host = await dns.lookup(os.hostname());
  return host.address;
}
