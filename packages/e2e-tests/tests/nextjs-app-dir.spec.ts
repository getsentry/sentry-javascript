import { test } from '@playwright/test';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const testName = 'nextjs-app-dir';
const testApplicationPath = path.join(__dirname, '..', 'test-applications', 'nextjs-app-dir');

const dependencyConfigurations = process.env.CANARY_E2E_TEST
  ? [
      {
        next: 'latest',
      },
      {
        next: 'canary',
      },
    ]
  : [
      {
        next: '13.2.4',
      },
      {
        next: '13.4.3',
      },
    ];

dependencyConfigurations.forEach(dependencyConfiguration => {
  test.describe.skip(`${testName} (${JSON.stringify(dependencyConfiguration)})`, () => {
    let targetDir: string;

    test.beforeAll(async () => {
      targetDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sentry-js-e2e-test-'));
      // @ts-ignore cp exists
      await fs.promises.cp(testApplicationPath, targetDir, { force: true, recursive: true });
      const packageJson: any = JSON.parse(await fs.promises.readFile(path.join(targetDir, 'package.json'), 'utf-8'));
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      packageJson.dependencies = { ...packageJson.dependencies, ...dependencyConfiguration };
      await fs.promises.writeFile(path.join(targetDir, 'package.json'), JSON.stringify(packageJson), 'utf-8');
      await promisify(cp.exec)('pnpm install', { cwd: targetDir });
      await promisify(cp.exec)('pnpm build', { cwd: targetDir });
    });

    test.afterAll(async () => {
      await fs.promises.rm(targetDir, { recursive: true, force: true });
    });

    test('builds', () => undefined);
  });
});
