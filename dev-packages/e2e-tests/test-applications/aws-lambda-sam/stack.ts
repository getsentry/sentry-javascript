import { Stack, CfnResource, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as dns from 'node:dns/promises';
import { platform } from 'node:process';
import { globSync } from 'glob';
import { execFileSync } from 'node:child_process';

const LAMBDA_FUNCTIONS_WITH_LAYER_DIR = './lambda-functions-layer';
const LAMBDA_FUNCTIONS_WITH_NPM_DIR = './lambda-functions-npm';
const LAMBDA_FUNCTION_TIMEOUT = 10;
const LAYER_DIR = './node_modules/@sentry/aws-serverless/';
export const SAM_PORT = 3001;
const NODE_RUNTIME = `nodejs${process.version.split('.').at(0)?.replace('v', '')}.x`;

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
      },
    });

    const dsn = `http://public@${hostIp}:3031/1337`;
    console.log(`[LocalLambdaStack] Using Sentry DSN: ${dsn}`);

    this.addLambdaFunctions({ functionsDir: LAMBDA_FUNCTIONS_WITH_LAYER_DIR, dsn, addLayer: true });
    this.addLambdaFunctions({ functionsDir: LAMBDA_FUNCTIONS_WITH_NPM_DIR, dsn, addLayer: false });
  }

  private addLambdaFunctions({
    functionsDir,
    dsn,
    addLayer,
  }: {
    functionsDir: string;
    dsn: string;
    addLayer: boolean;
  }) {
    console.log(`[LocalLambdaStack] Add all Lambda functions defined in ${functionsDir} to the SAM stack`);

    const lambdaDirs = fs
      .readdirSync(functionsDir)
      .filter(dir => fs.statSync(path.join(functionsDir, dir)).isDirectory());

    for (const lambdaDir of lambdaDirs) {
      const functionName = `${lambdaDir}${addLayer ? 'Layer' : 'Npm'}`;

      if (!addLayer) {
        console.log(`[LocalLambdaStack] Install dependencies for ${functionName}`);
        const packageJson = { dependencies: { '@sentry/aws-serverless': '* || latest' } };
        fs.writeFileSync(path.join(functionsDir, lambdaDir, 'package.json'), JSON.stringify(packageJson, null, 2));
        execFileSync('npm', ['install', '--prefix', path.join(functionsDir, lambdaDir)], { stdio: 'inherit' });
      }

      const isEsm = fs.existsSync(path.join(functionsDir, lambdaDir, 'index.mjs'));

      new CfnResource(this, functionName, {
        type: 'AWS::Serverless::Function',
        properties: {
          CodeUri: path.join(functionsDir, lambdaDir),
          Handler: 'index.handler',
          Runtime: NODE_RUNTIME,
          Timeout: LAMBDA_FUNCTION_TIMEOUT,
          Layers: addLayer ? [{ Ref: this.sentryLayer.logicalId }] : undefined,
          Environment: {
            Variables: {
              SENTRY_DSN: dsn,
              SENTRY_TRACES_SAMPLE_RATE: 1.0,
              SENTRY_DEBUG: true,
              NODE_OPTIONS: `--${isEsm ? 'import' : 'require'}=@sentry/aws-serverless/awslambda-auto`,
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
