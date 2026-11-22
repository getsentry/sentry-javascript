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
const roots = [
  ...new Set(
    packagePath.split(',').flatMap(directory => {
      if (directory === '.') {
        return [...names];
      }
      if (workspaces.includes(directory)) {
        return [readPackage(directory).name];
      }
      return fs.globSync('**/package.json', { cwd: directory, exclude: ['**/node_modules/**'] }).flatMap(file => {
        const manifest = readPackage(path.join(directory, path.dirname(file)));
        return Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).filter(name => names.has(name));
      });
    }),
  ),
];
if (!roots.length) {
  throw new Error(`No workspace dependencies found for ${packagePath}`);
}

// pnpm's ... selector includes workspace dependencies, including shared test runners and build tools.
const packages = JSON.parse(
  execFileSync('pnpm', [...roots.flatMap(name => ['--filter', `${name}...`]), '-r', 'list', '--depth=-1', '--json'], {
    encoding: 'utf8',
  }),
);
const projects = packages.map(pkg => pkg.name);
if (!projects.length) {
  throw new Error(`No SDK build projects selected for ${packagePath}`);
}
process.stderr.write(`Selected ${projects.length} workspace projects for ${packagePath}: ${projects.join(', ')}\n`);
process.stdout.write(`projects=${projects.join(',')}\n`);
