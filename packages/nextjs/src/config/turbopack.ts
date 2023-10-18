import * as path from 'path';

import type { NextConfigObject } from './types';

/**
 * Applies the config for turbopack mode.
 */
export function applyTurbopackOptions(nextConfig: NextConfigObject): void {
  nextConfig.experimental ??= {};
  nextConfig.experimental.turbo ??= {};
  nextConfig.experimental.turbo.rules ??= {};

  const rules = nextConfig.experimental.turbo.rules;

  rules['**/app/**/page.tsx'] ??= [];
  rules['**/app/**/page.tsx'].unshift({
    loader: path.resolve(__dirname, 'loaders', 'turboTestLoader.js'),
    options: {},
  });
}
