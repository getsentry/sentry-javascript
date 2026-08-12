import type { IntegrationFn } from '@sentry/core/browser';
import { debug, defineIntegration, getActiveSpan, getRootSpan, hasSpansEnabled } from '@sentry/core/browser';
import type { BrowserOptions } from '../client';
import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../helpers';
import { UIProfiler } from './UIProfiler';

const INTEGRATION_NAME = 'BrowserProfiling' as const;

const _browserProfilingIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const options = client.getOptions() as BrowserOptions;
      const profiler = new UIProfiler();

      if (!options.profileLifecycle) {
        // Set default lifecycle mode
        options.profileLifecycle = 'manual';
      }

      const activeSpan = getActiveSpan();
      const rootSpan = activeSpan && getRootSpan(activeSpan);
      const lifecycleMode = options.profileLifecycle;

      // Registering hooks in all lifecycle modes to be able to notify users in case they want to start/stop the profiler manually in `trace` mode
      client.on('startUIProfiler', () => profiler.start());
      client.on('stopUIProfiler', () => profiler.stop());

      if (lifecycleMode === 'manual') {
        profiler.initialize(client);
      } else if (lifecycleMode === 'trace') {
        if (!hasSpansEnabled(options)) {
          DEBUG_BUILD &&
            debug.warn(
              "[Profiling] `profileLifecycle` is 'trace' but tracing is disabled. Set a `tracesSampleRate` or `tracesSampler` to enable span tracing.",
            );
          return;
        }

        profiler.initialize(client);

        // If there is an active, sampled root span already, notify the profiler
        if (rootSpan) {
          profiler.notifyRootSpanActive(rootSpan);
        }

        // In case rootSpan is created slightly after setup -> schedule microtask to re-check and notify.
        WINDOW.setTimeout(() => {
          const laterActiveSpan = getActiveSpan();
          const laterRootSpan = laterActiveSpan && getRootSpan(laterActiveSpan);
          if (laterRootSpan) {
            profiler.notifyRootSpanActive(laterRootSpan);
          }
        }, 0);
      }
    },
  };
}) satisfies IntegrationFn;

export const browserProfilingIntegration = defineIntegration(_browserProfilingIntegration);
