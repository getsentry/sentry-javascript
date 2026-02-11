import * as path from 'path';
import type { SentryOptions } from './types';

/**
 * Creates a snippet that imports a Sentry.init file.
 */
export function buildSdkInitFileImportSnippet(filePath: string): string {
  return `import "${pathToPosix(filePath)}";`;
}

/**
 * Creates a snippet that initializes Sentry on the client by choosing
 * default options.
 */
export function buildClientSnippet(options: SentryOptions): string {
  return `import * as Sentry from "@sentry/astro";

Sentry.init({
  ${buildCommonInitOptions(options)}
  integrations: [${buildClientIntegrations(options)}],
  replaysSessionSampleRate: ${options.replaysSessionSampleRate ?? 0.1},
  replaysOnErrorSampleRate: ${options.replaysOnErrorSampleRate ?? 1.0},
});`;
}

/**
 * Creates a snippet that initializes Sentry on the server by choosing
 * default options.
 */
export function buildServerSnippet(options: SentryOptions): string {
  return `import * as Sentry from "@sentry/astro";

Sentry.init({
  ${buildCommonInitOptions(options)}
});`;
}

const buildCommonInitOptions = (options: SentryOptions): string => `dsn: ${
  options.dsn ? JSON.stringify(options.dsn) : 'import.meta.env.PUBLIC_SENTRY_DSN'
},
  debug: ${options.debug ? true : false},
  environment: ${options.environment ? JSON.stringify(options.environment) : 'import.meta.env.PUBLIC_VERCEL_ENV'},
  release: ${options.release ? JSON.stringify(options.release) : 'import.meta.env.PUBLIC_VERCEL_GIT_COMMIT_SHA'},
  tracesSampleRate: ${options.tracesSampleRate ?? 1.0},${
    options.sampleRate ? `\n  sampleRate: ${options.sampleRate},` : ''
  }`;

/**
 * We don't include the `BrowserTracing` integration if `bundleSizeOptimizations.excludeTracing` is falsy.
 * Likewise, we don't include the `Replay` integration if the replaysSessionSampleRate
 * and replaysOnErrorSampleRate are set to 0.
 *
 * This way, we avoid unnecessarily adding the integrations and thereby enable tree shaking of the integrations.
 */
const buildClientIntegrations = (options: SentryOptions): string => {
  const integrations: string[] = [];

  if (!options.bundleSizeOptimizations?.excludeTracing) {
    integrations.push('Sentry.browserTracingIntegration()');
  }

  if (
    options.replaysSessionSampleRate == null ||
    options.replaysSessionSampleRate ||
    options.replaysOnErrorSampleRate == null ||
    options.replaysOnErrorSampleRate
  ) {
    integrations.push('Sentry.replayIntegration()');
  }

  return integrations.join(', ');
};

function pathToPosix(originalPath: string): string {
  return originalPath.split(path.sep).join(path.posix.sep);
}
