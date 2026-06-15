/* eslint-disable no-console */
const { execSync } = require('child_process');
const { join } = require('path');
const { readFileSync, writeFileSync } = require('fs');

const cwd = join(__dirname, '../../..');

// Newer versions of the Express types use syntax that isn't supported by TypeScript 3.8.
// We'll pin to the last version of those types that are compatible.
console.log('Pinning Express types to old versions...');

const packageJsonPath = join(cwd, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

if (!packageJson.resolutions) packageJson.resolutions = {};
packageJson.resolutions['@types/express'] = '4.17.13';
packageJson.resolutions['@types/express-serve-static-core'] = '4.17.30';

writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

const tsVersion = '3.8';

console.log(`Installing typescript@${tsVersion}, and @types/node@14...`);

execSync(`yarn add --dev --ignore-workspace-root-check typescript@${tsVersion} @types/node@^14`, {
  stdio: 'inherit',
  cwd,
});

console.log('Removing unsupported tsconfig options...');

const baseTscConfigPath = join(cwd, 'packages/typescript/tsconfig.json');

const tsConfig = require(baseTscConfigPath);

// TS 3.8 fails build when it encounters a config option it does not understand, so we remove it :(
delete tsConfig.compilerOptions.noUncheckedIndexedAccess;

// TS 3.8 predates `node16` module/moduleResolution (added in TS 4.7). Restore the pre-`node16`
// base shape: drop `module` (so ts-node, which runs the scenarios, keeps emitting CommonJS) and
// use plain `node` resolution. Setting `module` to an ESM value here breaks the `ts-node/register`
// scenarios, which are loaded as CommonJS.
delete tsConfig.compilerOptions.module;
tsConfig.compilerOptions.moduleResolution = 'node';

writeFileSync(baseTscConfigPath, JSON.stringify(tsConfig, null, 2));
