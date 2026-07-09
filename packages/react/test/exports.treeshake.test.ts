/**
 * @vitest-environment node
 *
 * Guard the curated `@sentry/react` export surface.
 *
 * Optional heavy browser features must not appear on the package root so that
 * bundlers which materialize the full module namespace for
 * `import('@sentry/react')` (Rolldown + destructuring) cannot pull them into
 * the critical path.
 */
import { describe, expect, it } from 'vitest';
import * as SentryReact from '../src/index';

describe('@sentry/react export surface (tree-shaking)', () => {
  it('exposes core error monitoring and tracing APIs', () => {
    expect(typeof SentryReact.init).toBe('function');
    expect(typeof SentryReact.captureException).toBe('function');
    expect(typeof SentryReact.browserApiErrorsIntegration).toBe('function');
    expect(typeof SentryReact.breadcrumbsIntegration).toBe('function');
    expect(typeof SentryReact.browserTracingIntegration).toBe('function');
    expect(typeof SentryReact.thirdPartyErrorFilterIntegration).toBe('function');
    expect(typeof SentryReact.ErrorBoundary).toBe('function');
    expect(typeof SentryReact.reactErrorHandler).toBe('function');
    // Public API previously re-exported via export * from @sentry/browser
    expect(SentryReact.uiProfiler).toBeDefined();
    expect(typeof SentryReact.uiProfiler.startProfiler).toBe('function');
    expect(typeof SentryReact.uiProfiler.stopProfiler).toBe('function');
    expect(typeof SentryReact.getAbsoluteUrl).toBe('function');
  });

  it('does not export optional heavy browser features from the root entry', () => {
    const root = SentryReact as Record<string, unknown>;

    // These live on `@sentry/browser` / dedicated packages / optional-browser-api
    expect(root.replayIntegration).toBeUndefined();
    expect(root.getReplay).toBeUndefined();
    expect(root.feedbackIntegration).toBeUndefined();
    expect(root.getFeedback).toBeUndefined();
    expect(root.instrumentOpenAiClient).toBeUndefined();
    expect(root.instrumentAnthropicAiClient).toBeUndefined();
    expect(root.launchDarklyIntegration).toBeUndefined();
    expect(root.browserProfilingIntegration).toBeUndefined();
    expect(root.diagnoseSdkConnectivity).toBeUndefined();
  });

  it('re-exports uiProfiler from optional-browser-api with browserProfilingIntegration', async () => {
    const optional = await import('../src/optional-browser-api');
    expect(optional.uiProfiler).toBeDefined();
    expect(typeof optional.browserProfilingIntegration).toBe('function');
  });

  it('does not export router integrations from the root entry', () => {
    const root = SentryReact as Record<string, unknown>;

    // Import from `@sentry/react/tanstackrouter`, `/reactrouterv6`, etc.
    expect(root.tanstackRouterBrowserTracingIntegration).toBeUndefined();
    expect(root.reactRouterV6BrowserTracingIntegration).toBeUndefined();
    expect(root.reactRouterV7BrowserTracingIntegration).toBeUndefined();
    expect(root.createReduxEnhancer).toBeUndefined();
  });
});
