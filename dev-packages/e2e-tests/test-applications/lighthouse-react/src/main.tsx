import * as Sentry from '@sentry/react';
import { createRoot } from 'react-dom/client';
import App from './App';

const sentryInitStart = performance.now();

performance.measure('sentry-sdk-pre-init-duration', {
  detail: { mode: import.meta.env.MODE ?? 'unknown_mode' },
  start: 0,
  end: sentryInitStart,
});

performance.mark('sentry-sdk-init-start', {
  detail: { mode: import.meta.env.MODE ?? 'unknown_mode' },
});

if (import.meta.env.MODE === 'tracing-replay') {
  Sentry.init({
    dsn: import.meta.env.VITE_E2E_TEST_DSN as string | undefined,
    release: 'lighthouse-fixture',
    environment: 'qa',
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 1.0,
    replaysOnErrorSampleRate: 1.0,
  });
} else if (import.meta.env.MODE === 'tracing') {
  // Tracing + errors, but no replay — isolates the replay integration's cost.
  Sentry.init({
    dsn: import.meta.env.VITE_E2E_TEST_DSN as string | undefined,
    release: 'lighthouse-fixture',
    environment: 'qa',
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 1.0,
  });
} else if (import.meta.env.MODE === 'tracing-lazy-import') {
  // Tracing + errors, but browsertracing loaded lazily.
  // (We don't recommend this setup anywhere and neither will it work well.
  // this is purely for testing if it changes anything about overhead.)
  Sentry.init({
    dsn: import.meta.env.VITE_E2E_TEST_DSN as string | undefined,
    release: 'lighthouse-fixture',
    environment: 'qa',
    tracesSampleRate: 1.0,
  });

  import('@sentry/react').then(lazySentry => {
    Sentry.addIntegration(lazySentry.browserTracingIntegration());
  });
} else if (import.meta.env.MODE === 'errors-only') {
  // Default integrations only — errors are always captured, no tracing or replay.
  Sentry.init({
    dsn: import.meta.env.VITE_E2E_TEST_DSN as string | undefined,
    release: 'lighthouse-fixture',
    environment: 'qa',
  });
} else if (import.meta.env.MODE === 'minimal-integrations') {
  // Minimal integratoins setup only (everything necessary to automatically get errors)
  Sentry.init({
    dsn: import.meta.env.VITE_E2E_TEST_DSN as string | undefined,
    release: 'lighthouse-fixture',
    environment: 'qa',
    defaultIntegrations: false,
    integrations: [
      Sentry.globalHandlersIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
      // for good measure, let's include event filters since noise reduction is usually desired
      // 99% of this integration's work is done in an event processor, so outside the hot path
      Sentry.eventFiltersIntegration(),
    ],
  });
} else if (import.meta.env.MODE === 'no-integrations') {
  // DSN set but every integration disabled. Isolates the cost of the enabled
  // client itself from the default instrumentation that wraps DOM/timer/network APIs.
  Sentry.init({
    dsn: import.meta.env.VITE_E2E_TEST_DSN as string | undefined,
    release: 'lighthouse-fixture',
    environment: 'qa',
    defaultIntegrations: false,
    integrations: [],
  });
} else if (import.meta.env.MODE === 'no-browser-api-errors') {
  // Default integrations minus BrowserApiErrors, which wraps addEventListener/
  // removeEventListener on ~32 prototypes plus setTimeout/setInterval/rAF/XHR.
  // Isolates that global monkey-patching cost from the rest of the defaults.
  Sentry.init({
    dsn: import.meta.env.VITE_E2E_TEST_DSN as string | undefined,
    release: 'lighthouse-fixture',
    environment: 'qa',
    integrations: defaultIntegrations =>
      defaultIntegrations.filter(integration => integration.name !== 'BrowserApiErrors'),
  });
} else if (import.meta.env.MODE === 'no-breadcrumbs') {
  // Default integrations minus Breadcrumbs, which adds a lot of monkey patching to
  // DOM and Network APIs as well as event targets and listeners
  Sentry.init({
    dsn: import.meta.env.VITE_E2E_TEST_DSN as string | undefined,
    release: 'lighthouse-fixture',
    environment: 'qa',
    integrations: defaultIntegrations => defaultIntegrations.filter(integration => integration.name !== 'Breadcrumbs'),
  });
} else if (import.meta.env.MODE === 'no-browser-session') {
  // Default integrations minus Breadcrumbs, which adds a lot of monkey patching to
  // DOM and Network APIs as well as event targets and listeners
  Sentry.init({
    dsn: import.meta.env.VITE_E2E_TEST_DSN as string | undefined,
    release: 'lighthouse-fixture',
    environment: 'qa',
    integrations: defaultIntegrations =>
      defaultIntegrations.filter(integration => integration.name !== 'BrowserSession'),
  });
} else if (import.meta.env.MODE === 'init-only') {
  // enabled: false makes the SDK a guaranteed no-op (no transport allocation,
  // no DSN warning). We're measuring pure SDK-loading + tree-shaking cost.
  Sentry.init({ enabled: false });
}

performance.measure('sentry-sdk-init-duration', {
  detail: { mode: import.meta.env.MODE ?? 'unknown_mode' },
  start: sentryInitStart,
  end: performance.now(),
});
performance.mark('sentry-sdk-init-end', {
  detail: { mode: import.meta.env.MODE ?? 'unknown_mode' },
});

// 'no-sentry' mode: all branches above are statically dead, so Vite drops
// the @sentry/react import entirely from the bundle.

// Elements tagged with `elementtiming` (e.g. the hero logo) emit a
// PerformanceElementTiming entry when painted. Re-emit each as a
// performance.measure spanning time origin -> render so the element's render
// duration lands on the same timeline as the SDK init marks.
// `PerformanceElementTiming` isn't in this project's TS lib, so type it locally.
type ElementTimingEntry = PerformanceEntry & {
  identifier: string;
  renderTime: number;
  loadTime: number;
};

const elementTimingObserver = new PerformanceObserver(list => {
  for (const entry of list.getEntries() as ElementTimingEntry[]) {
    const renderEnd = entry.renderTime || entry.loadTime;

    performance.measure(`element-timing-${entry.identifier}`, {
      detail: { mode: import.meta.env.MODE ?? 'unknown_mode', identifier: entry.identifier },
      start: 0,
      end: renderEnd,
    });
  }
});

elementTimingObserver.observe({ type: 'element', buffered: true });

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
