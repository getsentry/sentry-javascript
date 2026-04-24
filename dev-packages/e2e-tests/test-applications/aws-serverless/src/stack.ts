import { Stack, CfnResource, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as dns from 'node:dns/promises';
import { arch, platform } from 'node:process';
import { execFileSync } from 'node:child_process';

const LAMBDA_FUNCTIONS_DIR = './src/lambda-functions-npm';
const LAMBDA_FUNCTION_TIMEOUT = 10;
export const SAM_PORT = 3001;

/** Match SAM / Docker to this machine so Apple Silicon does not mix arm64 images with an x86_64 template default. */
function samLambdaArchitecture(): 'arm64' | 'x86_64' {
  return arch === 'arm64' ? 'arm64' : 'x86_64';
}

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
  constructor(scope: Construct, id: string, props: StackProps, hostIp: string) {
    console.log('[LocalLambdaStack] Creating local SAM Lambda Stack');
    super(scope, id, props);

    this.templateOptions.templateFormatVersion = '2010-09-09';
    this.templateOptions.transforms = ['AWS::Serverless-2016-10-31'];

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
      const functionName = `Npm${lambdaDir}`;

      const lambdaPath = path.resolve(LAMBDA_FUNCTIONS_DIR, lambdaDir);
      const packageLockPath = path.join(lambdaPath, 'package-lock.json');
      const nodeModulesPath = path.join(lambdaPath, 'node_modules');

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
        fs.rmSync(packageLockPath);
      }

      if (fs.existsSync(nodeModulesPath)) {
        fs.rmSync(nodeModulesPath, { recursive: true, force: true });
      }

      const packageJson = {
        dependencies,
      };

      fs.writeFileSync(path.join(lambdaPath, 'package.json'), JSON.stringify(packageJson, null, 2));
      execFileSync('npm', ['install', '--install-links', '--prefix', lambdaPath], { stdio: 'inherit' });

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
