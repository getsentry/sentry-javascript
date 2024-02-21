import { buildClientSnippet, buildSdkInitFileImportSnippet, buildServerSnippet } from '../../src/integration/snippets';

const allSdkOptions = {
  dsn: 'my-dsn',
  release: '1.0.0',
  environment: 'staging',
  sampleRate: 0.2,
  tracesSampleRate: 0.3,
  replaysOnErrorSampleRate: 0.4,
  replaysSessionSampleRate: 0.5,
  debug: true,
};

describe('buildClientSnippet', () => {
  it('returns a basic Sentry init call with default options', () => {
    const snippet = buildClientSnippet({});
    expect(snippet).toMatchInlineSnapshot(`
      "import * as Sentry from \\"@sentry/astro\\";

      Sentry.init({
        dsn: import.meta.env.PUBLIC_SENTRY_DSN,
        debug: false,
        environment: import.meta.env.PUBLIC_VERCEL_ENV,
        release: import.meta.env.PUBLIC_VERCEL_GIT_COMMIT_SHA,
        tracesSampleRate: 1,
        integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1,
      });"
    `);
  });

  it('returns a basic Sentry init call with custom options', () => {
    const snippet = buildClientSnippet(allSdkOptions);

    expect(snippet).toMatchInlineSnapshot(`
      "import * as Sentry from \\"@sentry/astro\\";

      Sentry.init({
        dsn: \\"my-dsn\\",
        debug: true,
        environment: \\"staging\\",
        release: \\"1.0.0\\",
        tracesSampleRate: 0.3,
        sampleRate: 0.2,
        integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
        replaysSessionSampleRate: 0.5,
        replaysOnErrorSampleRate: 0.4,
      });"
    `);
  });

  it('does not include browserTracingIntegration if tracesSampleRate is 0', () => {
    const snippet = buildClientSnippet({ tracesSampleRate: 0 });
    expect(snippet).toMatchInlineSnapshot(`
      "import * as Sentry from \\"@sentry/astro\\";

      Sentry.init({
        dsn: import.meta.env.PUBLIC_SENTRY_DSN,
        debug: false,
        environment: import.meta.env.PUBLIC_VERCEL_ENV,
        release: import.meta.env.PUBLIC_VERCEL_GIT_COMMIT_SHA,
        tracesSampleRate: 0,
        integrations: [Sentry.replayIntegration()],
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1,
      });"
    `);
  });
});

it('does not include Replay if replay sample ratest are 0', () => {
  const snippet = buildClientSnippet({ replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0 });
  expect(snippet).toMatchInlineSnapshot(`
    "import * as Sentry from \\"@sentry/astro\\";

    Sentry.init({
      dsn: import.meta.env.PUBLIC_SENTRY_DSN,
      debug: false,
      environment: import.meta.env.PUBLIC_VERCEL_ENV,
      release: import.meta.env.PUBLIC_VERCEL_GIT_COMMIT_SHA,
      tracesSampleRate: 1,
      integrations: [Sentry.browserTracingIntegration()],
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    });"
  `);
});

describe('buildServerSnippet', () => {
  it('returns a basic Sentry init call with default options', () => {
    const snippet = buildServerSnippet({});
    expect(snippet).toMatchInlineSnapshot(`
      "import * as Sentry from \\"@sentry/astro\\";

      Sentry.init({
        dsn: import.meta.env.PUBLIC_SENTRY_DSN,
        debug: false,
        environment: import.meta.env.PUBLIC_VERCEL_ENV,
        release: import.meta.env.PUBLIC_VERCEL_GIT_COMMIT_SHA,
        tracesSampleRate: 1,
      });"
    `);
  });

  it('returns a basic Sentry init call with custom options', () => {
    const snippet = buildServerSnippet(allSdkOptions);

    expect(snippet).toMatchInlineSnapshot(`
      "import * as Sentry from \\"@sentry/astro\\";

      Sentry.init({
        dsn: \\"my-dsn\\",
        debug: true,
        environment: \\"staging\\",
        release: \\"1.0.0\\",
        tracesSampleRate: 0.3,
        sampleRate: 0.2,
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
