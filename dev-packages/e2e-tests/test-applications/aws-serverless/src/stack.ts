import { Stack, CfnResource, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as dns from 'node:dns/promises';
import { platform } from 'node:process';
import { globSync } from 'glob';
import { execFileSync } from 'node:child_process';

const LAMBDA_FUNCTIONS_WITH_LAYER_DIR = './src/lambda-functions-layer';
const LAMBDA_FUNCTIONS_WITH_NPM_DIR = './src/lambda-functions-npm';
const LAMBDA_FUNCTION_TIMEOUT = 10;
const LAYER_DIR = './node_modules/@sentry/aws-serverless/';
const DEFAULT_NODE_VERSION = '22';
export const SAM_PORT = 3001;

function resolvePackagesDir(): string {
  // When running via the e2e test runner, tests are copied to a temp directory
  // so we need the workspace root passed via env var
  const workspaceRoot = process.env.SENTRY_E2E_WORKSPACE_ROOT;
  if (workspaceRoot) {
    return path.join(workspaceRoot, 'packages');
  }
  // Fallback for local development when running from the original location
  return path.resolve(__dirname, '../../../../../packages');
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
      const functionName = `${addLayer ? 'Layer' : 'Npm'}${lambdaDir}`;

      if (!addLayer) {
        const lambdaPath = path.resolve(functionsDir, lambdaDir);
        const packageLockPath = path.join(lambdaPath, 'package-lock.json');
        const nodeModulesPath = path.join(lambdaPath, 'node_modules');

        // Point the dependency at the locally built packages so tests use the current workspace bits
        // We need to link all @sentry/* packages that are dependencies of aws-serverless
        // because otherwise npm will try to install them from the registry, where the current version is not yet published
        const packagesToLink = ['aws-serverless', 'node', 'core', 'node-core', 'opentelemetry'];
        const dependencies: Record<string, string> = {};

        const packagesDir = resolvePackagesDir();
        for (const pkgName of packagesToLink) {
          const pkgDir = path.join(packagesDir, pkgName);
          if (!fs.existsSync(pkgDir)) {
            throw new Error(
              `[LocalLambdaStack] Workspace package ${pkgName} not found at ${pkgDir}. Did you run the build?`,
            );
          }
          const relativePath = path.relative(lambdaPath, pkgDir);
          dependencies[`@sentry/${pkgName}`] = `file:${relativePath.replace(/\\/g, '/')}`;
        }

        console.log(`[LocalLambdaStack] Install dependencies for ${functionName}`);

        if (fs.existsSync(packageLockPath)) {
          // Prevent stale lock files from pinning the published package version
          fs.rmSync(packageLockPath);
        }

        if (fs.existsSync(nodeModulesPath)) {
          // Ensure we reinstall from the workspace instead of reusing cached dependencies
          fs.rmSync(nodeModulesPath, { recursive: true, force: true });
        }

        const packageJson = {
          dependencies,
        };

        fs.writeFileSync(path.join(lambdaPath, 'package.json'), JSON.stringify(packageJson, null, 2));
        // Use --install-links to copy files instead of creating symlinks for file: dependencies.
        // Symlinks don't work inside the Docker container because the target paths don't exist there.
        execFileSync('npm', ['install', '--install-links', '--prefix', lambdaPath], { stdio: 'inherit' });
      }

      new CfnResource(this, functionName, {
        type: 'AWS::Serverless::Function',
        properties: {
          CodeUri: path.join(functionsDir, lambdaDir),
          Handler: 'index.handler',
          Runtime: `nodejs${process.env.NODE_VERSION ?? DEFAULT_NODE_VERSION}.x`,
          Timeout: LAMBDA_FUNCTION_TIMEOUT,
          Layers: addLayer ? [{ Ref: this.sentryLayer.logicalId }] : undefined,
          Environment: {
            Variables: {
              SENTRY_DSN: dsn,
              SENTRY_TRACES_SAMPLE_RATE: 1.0,
              SENTRY_DEBUG: true,
              NODE_OPTIONS: `--import=@sentry/aws-serverless/awslambda-auto`,
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
