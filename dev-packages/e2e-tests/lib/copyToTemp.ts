/* eslint-disable no-console */
import { readFileSync, writeFileSync } from 'fs';
import { cp } from 'fs/promises';
import { join } from 'path';

export async function copyToTemp(originalPath: string, tmpDirPath: string): Promise<void> {
  // copy files to tmp dir
  await cp(originalPath, tmpDirPath, { recursive: true });

  fixPackageJson(tmpDirPath);
}

function fixPackageJson(cwd: string): void {
  const packageJsonPath = join(cwd, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    volta?: Record<string, unknown>;
  };

  // 1. Fix file dependencies
  const didFixTestUtilsDependency =
    (packageJson.dependencies && fixTestUtilsDependency(packageJson.dependencies)) ||
    (packageJson.devDependencies && fixTestUtilsDependency(packageJson.devDependencies));

  if (!didFixTestUtilsDependency) {
    console.log("No '@sentry-internal/test-utils' dependency found");
  }

  // 2. Fix volta extends
  if (packageJson.volta?.extends === '../../package.json') {
    const newPath = join(__dirname, '../package.json');
    packageJson.volta.extends = newPath;
    console.log(`Fixed volta.extends to ${newPath}`);
  } else {
    console.log('No volta.extends found');
  }

  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
}

function fixTestUtilsDependency(dependencyObj: Record<string, string>): boolean {
  // 1. Fix file dependencies
  if (dependencyObj['@sentry-internal/test-utils']) {
    const newPath = join(__dirname, '../../test-utils');
    dependencyObj['@sentry-internal/test-utils'] = `link:${newPath}`;
    console.log(`Fixed '@sentry-internal/test-utils' dependency to ${newPath}`);
    return true;
  }

  return false;
}
