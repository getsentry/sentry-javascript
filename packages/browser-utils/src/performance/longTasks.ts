import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, GLOBAL_OBJ } from '@sentry/core';
import { startTrackingLongAnimationFrames, startTrackingLongTasks } from './entries';

interface LongTasksOptions {
  /**
   * If true, long tasks are captured as spans when long animation frames are disabled or not supported.
   *
   * Default: true
   */
  enableLongTask?: boolean;

  /**
   * If true, long animation frames are captured as spans in browsers that support them.
   *
   * Default: true
   */
  enableLongAnimationFrame?: boolean;
}

const INTEGRATION_NAME = 'LongTasks';

const _longTasksIntegration = ((options: LongTasksOptions = {}) => {
  const { enableLongTask = true, enableLongAnimationFrame = true } = options;

  return {
    name: INTEGRATION_NAME,
    setup() {
      if (
        enableLongAnimationFrame &&
        GLOBAL_OBJ.PerformanceObserver &&
        PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')
      ) {
        startTrackingLongAnimationFrames();
      } else if (enableLongTask) {
        startTrackingLongTasks();
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Captures long animation frames, or long tasks where those are not supported, as spans on the active span.
 */
export const longTasksIntegration = defineIntegration(_longTasksIntegration);
