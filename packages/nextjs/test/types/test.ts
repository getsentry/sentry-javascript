import { execSync } from 'child_process';
/* eslint-disable no-console */
import { parseSemver } from '@sentry/utils';

const NODE_VERSION = parseSemver(process.versions.node);

if (NODE_VERSION.major && NODE_VERSION.major >= 12) {
  console.log('Installing next@v12...');
  execSync('yarn install', { stdio: 'inherit' });
  console.log('Testing some types...');
  execSync('tsc --noEmit --project tsconfig.json', { stdio: 'inherit' });
}
