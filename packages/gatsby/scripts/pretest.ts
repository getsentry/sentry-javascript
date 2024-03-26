import { execSync } from 'child_process';
import * as fs from 'fs';

function ensurePluginTypes(): void {
  if (!fs.existsSync('gatsby-node.d.ts')) {
    // eslint-disable-next-line no-console
    console.warn(
      '\nWARNING: Missing types for gatsby plugin files. Types will be created before running gatsby tests.',
    );
    execSync('yarn build:plugin');
  }
}

ensurePluginTypes();
