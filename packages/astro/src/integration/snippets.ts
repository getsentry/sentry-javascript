import type { SentryOptions } from './types';

/**
 * Creates a snippet that imports a Sentry.init file.
 */
export function buildSdkInitFileImportSnippet(filePath: string): string {
  return `import "${filePath}";`;
}

/**
 * Creates a snippet that initializes Sentry on the client by choosing
 * default options.
 */
export function buildClientSnippet(options: SentryOptions): string {
  return `import * as Sentry from "@sentry/astro";

Sentry.init({
  ${buildCommonInitOptions(options)}
  integrations: [new Sentry.BrowserTracing(), new Sentry.Replay()],
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
