#!/usr/bin/env node
// All bins have to point at this one file: `npx @sentry/remix` can only pick an executable if every bin has the same
// target (or if one is called `remix`, which would collide with the Remix CLI).
import * as path from 'node:path';

// Windows and pnpm bin shims don't preserve the bin name, so also detect Remix 3 by its required `--entry` option.
const isRemixV3 =
  path.basename(process.argv[1]) === 'sentry-remix-v3-upload-sourcemaps' ||
  process.argv.slice(2).some(arg => arg === '--entry' || arg.startsWith('--entry='));

if (isRemixV3) {
  await import('./sentry-remix-v3-upload-sourcemaps.mjs');
} else {
  await import('./sentry-upload-sourcemaps.js');
}
