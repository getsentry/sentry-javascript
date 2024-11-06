/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { expect } from '@playwright/test';
import { SDK_VERSION } from '@sentry/browser';
import type { ReplayEvent } from '@sentry/types';

const DEFAULT_REPLAY_EVENT = {
  type: 'replay_event',
  timestamp: expect.any(Number),
  error_ids: [],
  trace_ids: [],
  urls: [expect.stringContaining('/index.html')],
  replay_id: expect.stringMatching(/\w{32}/),
  replay_start_timestamp: expect.any(Number),
  segment_id: 0,
  replay_type: 'session',
  event_id: expect.stringMatching(/\w{32}/),
  environment: 'production',
  sdk: {
    integrations: [
      'InboundFilters',
      'FunctionToString',
      'BrowserApiErrors',
      'Breadcrumbs',
      'GlobalHandlers',
      'LinkedErrors',
      'Dedupe',
      'HttpContext',
      'Replay',
    ],
    version: SDK_VERSION,
    name: 'sentry.javascript.browser',
  },
  request: {
    url: expect.stringContaining('/index.html'),
    headers: {
      'User-Agent': expect.stringContaining(''),
    },
  },
  platform: 'javascript',
};

/**
 * Creates a ReplayEvent object with the default values merged with the customExpectedReplayEvent.
 * This is useful for testing multi-segment replays to not repeat most of the properties that don't change
 * throughout the replay segments.
 *
 * Note: The benefit of this approach over expect.objectContaining is that,
 *       we'll catch if properties we expect to stay the same actually change.
 *
 * @param customExpectedReplayEvent overwrite the default values with custom values (e.g. segment_id)
 */
export function getExpectedReplayEvent(customExpectedReplayEvent: Partial<ReplayEvent> & Record<string, unknown> = {}) {
  return {
    ...DEFAULT_REPLAY_EVENT,
    ...customExpectedReplayEvent,
  };
}

/* This is how we expect different kinds of navigation performance span to look: */

export const expectedNavigationPerformanceSpan = {
  op: 'navigation.navigate',
  description: expect.any(String),
  startTimestamp: expect.any(Number),
  endTimestamp: expect.any(Number),
  data: {
    decodedBodySize: expect.any(Number),
    encodedBodySize: expect.any(Number),
    duration: expect.any(Number),
    domInteractive: expect.any(Number),
    domContentLoadedEventEnd: expect.any(Number),
    domContentLoadedEventStart: expect.any(Number),
    loadEventStart: expect.any(Number),
    loadEventEnd: expect.any(Number),
    domComplete: expect.any(Number),
    redirectCount: expect.any(Number),
    size: expect.any(Number),
  },
};

export const expectedNavigationPushPerformanceSpan = {
  op: 'navigation.push',
  description: expect.any(String),
  startTimestamp: expect.any(Number),
  endTimestamp: expect.any(Number),
  data: {},
};

export const expectedReloadPerformanceSpan = {
  op: 'navigation.reload',
  description: expect.any(String),
  startTimestamp: expect.any(Number),
  endTimestamp: expect.any(Number),
  data: {
    decodedBodySize: expect.any(Number),
    encodedBodySize: expect.any(Number),
    duration: expect.any(Number),
    domInteractive: expect.any(Number),
    domContentLoadedEventEnd: expect.any(Number),
    domContentLoadedEventStart: expect.any(Number),
    loadEventStart: expect.any(Number),
    loadEventEnd: expect.any(Number),
    domComplete: expect.any(Number),
    redirectCount: expect.any(Number),
    size: expect.any(Number),
  },
};

export const expectedMemoryPerformanceSpan = {
  op: 'memory',
  description: 'memory',
  startTimestamp: expect.any(Number),
  endTimestamp: expect.any(Number),
  data: {
    memory: {
      jsHeapSizeLimit: expect.any(Number),
      totalJSHeapSize: expect.any(Number),
      usedJSHeapSize: expect.any(Number),
    },
  },
};

export const expectedLCPPerformanceSpan = {
  op: 'web-vital',
  description: 'largest-contentful-paint',
  startTimestamp: expect.any(Number),
  endTimestamp: expect.any(Number),
  data: {
    value: expect.any(Number),
    nodeIds: expect.any(Array),
    rating: expect.any(String),
    size: expect.any(Number),
  },
};

export const expectedCLSPerformanceSpan = {
  op: 'web-vital',
  description: 'cumulative-layout-shift',
  startTimestamp: expect.any(Number),
  endTimestamp: expect.any(Number),
  data: {
    value: expect.any(Number),
    nodeIds: expect.any(Array),
    attributions: expect.any(Array),
    rating: expect.any(String),
    size: expect.any(Number),
  },
};

export const expectedFIDPerformanceSpan = {
  op: 'web-vital',
  description: 'first-input-delay',
  startTimestamp: expect.any(Number),
  endTimestamp: expect.any(Number),
  data: {
    value: expect.any(Number),
    rating: expect.any(String),
    size: expect.any(Number),
    nodeIds: expect.any(Array),
  },
};

export const expectedINPPerformanceSpan = {
  op: 'web-vital',
  description: 'interaction-to-next-paint',
  startTimestamp: expect.any(Number),
  endTimestamp: expect.any(Number),
  data: {
    value: expect.any(Number),
    rating: expect.any(String),
    size: expect.any(Number),
    nodeIds: expect.any(Array),
  },
};

export const expectedFCPPerformanceSpan = {
  op: 'paint',
  description: 'first-contentful-paint',
  startTimestamp: expect.any(Number),
  endTimestamp: expect.any(Number),
};

export const expectedFPPerformanceSpan = {
  op: 'paint',
  description: 'first-paint',
  startTimestamp: expect.any(Number),
  endTimestamp: expect.any(Number),
};

export const expectedFetchPerformanceSpan = {
  op: 'resource.fetch',
  description: 'https://example.com',
  startTimestamp: expect.any(Number),
  endTimestamp: expect.any(Number),
  data: {
    method: 'POST',
    statusCode: 200,
    request: {
      size: 3,
      headers: {},
      _meta: {
        warnings: ['URL_SKIPPED'],
      },
    },
    response: {
      size: 11,
      headers: {},
      _meta: {
        warnings: ['URL_SKIPPED'],
      },
    },
  },
};

export const expectedXHRPerformanceSpan = {
  op: 'resource.xhr',
  description: 'https://example.com',
  startTimestamp: expect.any(Number),
  endTimestamp: expect.any(Number),
  data: {
    method: 'GET',
    statusCode: 200,
    request: {
      headers: {},
      _meta: {
        warnings: ['URL_SKIPPED'],
      },
    },
    response: {
      size: 11,
      headers: {},
      _meta: {
        warnings: ['URL_SKIPPED'],
      },
    },
  },
};

/* Breadcrumbs */

export const expectedClickBreadcrumb = {
  timestamp: expect.any(Number),
  type: 'default',
  category: 'ui.click',
  message: expect.any(String),
  data: {
    nodeId: expect.any(Number),
    node: {
      attributes: {
        id: expect.any(String),
      },
      id: expect.any(Number),
      tagName: expect.any(String),
      textContent: expect.any(String),
    },
  },
};

export const expectedNavigationBreadcrumb = {
  timestamp: expect.any(Number),
  type: 'default',
  category: 'navigation',
  data: {
    from: expect.any(String),
    to: expect.any(String),
  },
};

export const expectedConsoleBreadcrumb = {
  timestamp: expect.any(Number),
  type: 'default',
  category: 'console',
  data: {
    logger: 'console',
    arguments: expect.any(Array),
  },
  level: expect.stringMatching(/(log|warn|error)/),
  message: expect.any(String),
};
