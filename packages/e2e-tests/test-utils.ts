import { test } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function withTestApp(
  config: {
    testAppName: string;
    testApplicationPath: string;
    dependencyConfigurations?: Record<string, string>[];
    canaryDependencyConfigurations?: Record<string, string>[];
  },
  callback: (cwd: string) => void | Promise<void>,
): void {
  const dependencyConfigurations = (process.env.CANARY_E2E_TEST
    ? config.canaryDependencyConfigurations
    : config.dependencyConfigurations) ?? [{}];

  dependencyConfigurations.forEach(dependencyConfiguration => {
    let targetDir: string;
    test.describe(`${config.testAppName} (${JSON.stringify(dependencyConfiguration)})`, () => {
      test.beforeAll(async () => {
        targetDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sentry-js-e2e-test-app-'));
        // @ts-ignore cp exists
        await fs.promises.cp(config.testApplicationPath, targetDir, { force: true, recursive: true });
        const packageJson: any = JSON.parse(await fs.promises.readFile(path.join(targetDir, 'package.json'), 'utf-8'));
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        packageJson.dependencies = { ...packageJson.dependencies, ...dependencyConfiguration };
        await fs.promises.writeFile(path.join(targetDir, 'package.json'), JSON.stringify(packageJson), 'utf-8');
      });

      test.afterAll(async () => {
        // @ts-ignore rm exists
        await fs.promises.rm(targetDir, { recursive: true, force: true });
      });

      void callback(targetDir);
    });
  });
}
