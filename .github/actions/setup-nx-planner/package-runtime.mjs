import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const nxPackage = fs.realpathSync(require.resolve('nx/package.json'));
const destination = path.resolve(process.argv[2]);
const modules = path.join(destination, 'node_modules');

// Nx lists its runtime dependency closure directly; pnpm links it all in this directory.
const nxDependencies = path.resolve(nxPackage, '../..');
fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
execFileSync('cp', ['-RL', nxDependencies, modules]);
// Nx's pnpm lockfile reader requires the install metadata, even without workspace dependencies.
fs.copyFileSync('node_modules/.modules.yaml', path.join(modules, '.modules.yaml'));
fs.mkdirSync(path.join(modules, '.bin'), { recursive: true });
fs.symlinkSync('../nx/dist/bin/nx.js', path.join(modules, '.bin/nx'));
