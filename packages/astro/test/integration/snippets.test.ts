import { describe, expect, it } from 'vitest';
import { buildClientSnippet, buildSdkInitFileImportSnippet, buildServerSnippet } from '../../src/integration/snippets';
import type { SentryOptions } from '../../src/integration/types';

const buildTimeSdkOptions: SentryOptions = {
  release: { name: '1.0.0' },
  debug: true,
};

describe('buildClientSnippet', () => {
  it('returns a basic Sentry init call with default options', () => {
    const snippet = buildClientSnippet({});
    expect(snippet).toMatchInlineSnapshot(`
      "import * as Sentry from "@sentry/astro";

      Sentry.init({
        dsn: import.meta.env.PUBLIC_SENTRY_DSN,
        debug: false,
        environment: import.meta.env.PUBLIC_VERCEL_ENV,
        release: import.meta.env.PUBLIC_VERCEL_GIT_COMMIT_SHA,
        tracesSampleRate: 1.0,
        integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
      });"
    `);
  });

  it('returns a basic Sentry init call with build-time options', () => {
    const snippet = buildClientSnippet(buildTimeSdkOptions);

    expect(snippet).toMatchInlineSnapshot(`
      "import * as Sentry from "@sentry/astro";

      Sentry.init({
        dsn: import.meta.env.PUBLIC_SENTRY_DSN,
        debug: true,
        environment: import.meta.env.PUBLIC_VERCEL_ENV,
        release: "1.0.0",
        tracesSampleRate: 1.0,
        integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
      });"
    `);
  });

  it('does not include browserTracingIntegration if bundleSizeOptimizations.excludeTracing is true', () => {
    const snippet = buildClientSnippet({ bundleSizeOptimizations: { excludeTracing: true } });
    expect(snippet).toMatchInlineSnapshot(`
      "import * as Sentry from "@sentry/astro";

      Sentry.init({
        dsn: import.meta.env.PUBLIC_SENTRY_DSN,
        debug: false,
        environment: import.meta.env.PUBLIC_VERCEL_ENV,
        release: import.meta.env.PUBLIC_VERCEL_GIT_COMMIT_SHA,
        tracesSampleRate: 1.0,
        integrations: [Sentry.replayIntegration()],
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
      });"
    `);
  });
});

describe('buildServerSnippet', () => {
  it('returns a basic Sentry init call with default options', () => {
    const snippet = buildServerSnippet({});
    expect(snippet).toMatchInlineSnapshot(`
      "import * as Sentry from "@sentry/astro";

      Sentry.init({
        dsn: import.meta.env.PUBLIC_SENTRY_DSN,
        debug: false,
        environment: import.meta.env.PUBLIC_VERCEL_ENV,
        release: import.meta.env.PUBLIC_VERCEL_GIT_COMMIT_SHA,
        tracesSampleRate: 1.0,
      });"
    `);
  });

  it('returns a basic Sentry init call with build-time options', () => {
    const snippet = buildServerSnippet(buildTimeSdkOptions);

    expect(snippet).toMatchInlineSnapshot(`
      "import * as Sentry from "@sentry/astro";

      Sentry.init({
        dsn: import.meta.env.PUBLIC_SENTRY_DSN,
        debug: true,
        environment: import.meta.env.PUBLIC_VERCEL_ENV,
        release: "1.0.0",
        tracesSampleRate: 1.0,
      });"
    `);
  });
});

describe('buildSdkInitFileImportSnippet', () => {
  it('returns a snippet that imports a file', () => {
    const snippet = buildSdkInitFileImportSnippet('./my-file.ts');
    expect(snippet).toBe('import "./my-file.ts";');
  });
});
