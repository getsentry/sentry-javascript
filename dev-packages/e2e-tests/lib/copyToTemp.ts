import { readFileSync, writeFileSync } from 'fs';
import { cp } from 'fs/promises';
import { join, relative, resolve } from 'path';

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
    const relativePath = resolve(relative(cwd, join(__dirname, '../test-utils')));
    packageJson.devDependencies['@sentry-internal/test-utils'] = `link:${relativePath}`;
  }

  // 2. Fix volta extends
  if (packageJson.volta?.extends === '../../package.json') {
    const voltaPath = resolve(relative(cwd, join(__dirname, './package.json')));
    packageJson.volta.extends = voltaPath;
  }

  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
}
