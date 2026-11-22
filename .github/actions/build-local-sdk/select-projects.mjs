import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const readPackage = directory => JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
const workspaces = readPackage('.').workspaces;
const names = new Set(workspaces.map(directory => readPackage(directory).name));
const packagePath = process.env.INPUT_PACKAGE_PATH;
if (!packagePath) {
  throw new Error('Select a package path, or explicitly use . for repo-wide checks.');
}
const manifest = readPackage(packagePath);
const roots =
  packagePath === '.'
    ? [...names]
    : workspaces.includes(packagePath)
      ? [manifest.name]
      : Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).filter(name => names.has(name));
if (!roots.length) {
  throw new Error(`No workspace dependencies found for ${packagePath}`);
}

// pnpm's ... selector includes workspace dependencies, including shared test runners and build tools.
const packages = JSON.parse(
  execFileSync('pnpm', [...roots.flatMap(name => ['--filter', `${name}...`]), '-r', 'list', '--depth=-1', '--json'], {
    encoding: 'utf8',
  }),
);
const projects = packages
  .filter(pkg => {
    const { scripts = {} } = readPackage(pkg.path);
    return scripts['build:transpile'] || scripts['build:types'];
  })
  .map(pkg => pkg.name);
if (!projects.length) {
  throw new Error(`No SDK build projects selected for ${packagePath}`);
}
console.error(`Selected ${projects.length} build projects for ${packagePath}: ${projects.join(', ')}`);
console.log(`projects=${projects.join(',')}`);
