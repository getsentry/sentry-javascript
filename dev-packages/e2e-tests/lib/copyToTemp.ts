import { readFileSync, writeFileSync } from 'fs';
import { cp } from 'fs/promises';
import { join, resolve } from 'path';

export async function copyToTemp(originalPath: string, tmpDirPath: string): Promise<void> {
  // copy files to tmp dir
  await cp(originalPath, tmpDirPath, { recursive: true });

  fixPackageJson(tmpDirPath);
}

function fixPackageJson(cwd: string): void {
  const packageJsonPath = join(cwd, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    devDependencies?: Record<string, string>;
    volta?: Record<string, unknown>;
  };

  // 1. Fix file dependencies
  if (packageJson.devDependencies?.['@sentry-internal/test-utils']) {
    const newPath = resolve(join(__dirname, '../../test-utils'));
    packageJson.devDependencies['@sentry-internal/test-utils'] = `link:${newPath}`;
    // eslint-disable-next-line no-console
    console.log(`Fixed devDependencies['@sentry-internal/test-utils'] to ${newPath}`);
  }

  // 2. Fix volta extends
  if (packageJson.volta?.extends === '../../package.json') {
    const newPath = resolve(join(__dirname, '../package.json'));
    packageJson.volta.extends = newPath;
    // eslint-disable-next-line no-console
    console.log(`Fixed volta.extends to ${newPath}`);
  }

  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
}
