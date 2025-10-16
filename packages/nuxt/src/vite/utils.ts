import * as fs from 'fs';
import type { Nuxt } from 'nuxt/schema';
import * as path from 'path';

/**
 *  Find the default SDK init file for the given type (client or server).
 *  The sentry.server.config file is prioritized over the instrument.server file.
 */
export function findDefaultSdkInitFile(type: 'server' | 'client', nuxt?: Nuxt): string | undefined {
  const possibleFileExtensions = ['ts', 'js', 'mjs', 'cjs', 'mts', 'cts'];
  const relativePaths: string[] = [];

  if (type === 'server') {
    for (const ext of possibleFileExtensions) {
      relativePaths.push(`sentry.${type}.config.${ext}`);
      relativePaths.push(path.join('public', `instrument.${type}.${ext}`));
    }
  } else {
    for (const ext of possibleFileExtensions) {
      relativePaths.push(`sentry.${type}.config.${ext}`);
    }
  }

  // Get layers from highest priority to lowest
  const layers = [...(nuxt?.options._layers ?? [])].reverse();

  for (const layer of layers) {
    for (const relativePath of relativePaths) {
      const fullPath = path.resolve(layer.cwd, relativePath);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  // As a fallback, also check CWD (left for pure compatibility)
  const cwd = process.cwd();
  for (const relativePath of relativePaths) {
    const fullPath = path.resolve(cwd, relativePath);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  return undefined;
}

/**
 * Sets up alias to work around OpenTelemetry's incomplete ESM imports.
 * https://github.com/getsentry/sentry-javascript/issues/15204
 *
 * OpenTelemetry's @opentelemetry/resources package has incomplete imports missing
 * the .js file extensions (like execAsync for machine-id detection). This causes module resolution
 * errors in certain Nuxt configurations, particularly when local Nuxt modules in Nuxt 4 are present.
 *
 * @see https://nuxt.com/docs/guide/concepts/esm#aliasing-libraries
 */
export function addOTelCommonJSImportAlias(nuxt: Nuxt): void {
  if (!nuxt.options.dev) {
    return;
  }

  if (!nuxt.options.alias) {
    nuxt.options.alias = {};
  }

  if (!nuxt.options.alias['@opentelemetry/resources']) {
    nuxt.options.alias['@opentelemetry/resources'] = '@opentelemetry/resources/build/src/index.js';
  }
}
