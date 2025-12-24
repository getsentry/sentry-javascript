/* eslint-disable no-console */
const { execSync } = require('child_process');
const { join } = require('path');

const cwd = join(__dirname, '../../..');

const tsVersion = '5.0.4';

console.log(`Installing typescript@${tsVersion}, and @types/node@18...`);

execSync(`yarn add --dev --ignore-workspace-root-check typescript@${tsVersion} @types/node@^18`, {
  stdio: 'inherit',
  cwd,
});

console.log('TypeScript version updated successfully.');
