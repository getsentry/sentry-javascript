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
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
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

const buildCommonInitOptions = (options: SentryOptions): string => `dsn: import.meta.env.PUBLIC_SENTRY_DSN,
  debug: ${options.debug ? true : false},
  environment: import.meta.env.PUBLIC_VERCEL_ENV,
  release: ${
    options.release?.name ? JSON.stringify(options.release.name) : 'import.meta.env.PUBLIC_VERCEL_GIT_COMMIT_SHA'
  },
  tracesSampleRate: 1.0,`;

/**
 * We don't include the `BrowserTracing` integration if `bundleSizeOptimizations.excludeTracing` is set.
 * The `Replay` integration, however, is always included with default sample rates in the generated snippet.
 */
const buildClientIntegrations = (options: SentryOptions): string => {
  const integrations: string[] = [];

  if (!options.bundleSizeOptimizations?.excludeTracing) {
    integrations.push('Sentry.browserTracingIntegration()');
  }

  integrations.push('Sentry.replayIntegration()');

  return integrations.join(', ');
};

function pathToPosix(originalPath: string): string {
  return originalPath.split(path.sep).join(path.posix.sep);
}
