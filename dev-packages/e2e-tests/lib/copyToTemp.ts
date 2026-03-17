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
  if (packageJson.dependencies) {
    fixFileLinkDependencies(packageJson.dependencies);
  }
  if (packageJson.devDependencies) {
    fixFileLinkDependencies(packageJson.devDependencies);
  }

  // 2. Fix volta extends
  if (!packageJson.volta) {
    throw new Error("No volta config found, please add one to the test app's package.json!");
  }

  if (typeof packageJson.volta.extends === 'string') {
    const extendsPath = packageJson.volta.extends;
    // We add a virtual dir to ensure that the relative depth is consistent
    // dirPath is relative to ./../test-applications/xxx
    const newPath = join(__dirname, 'virtual-dir/', extendsPath);
    packageJson.volta.extends = newPath;
    console.log(`Fixed volta.extends to ${newPath}`);
  } else {
    console.log('No volta.extends found');
  }

  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
}

function fixFileLinkDependencies(dependencyObj: Record<string, string>): void {
  for (const [key, value] of Object.entries(dependencyObj)) {
    if (value.startsWith('link:')) {
      const dirPath = value.replace('link:', '');

      // We add a virtual dir to ensure that the relative depth is consistent
      // dirPath is relative to ./../test-applications/xxx
      const newPath = join(__dirname, 'virtual-dir/', dirPath);

      dependencyObj[key] = `link:${newPath}`;
      console.log(`Fixed ${key} dependency to ${newPath}`);
    }
  }
}
