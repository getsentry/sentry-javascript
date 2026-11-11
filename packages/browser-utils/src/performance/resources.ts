import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, hasSpanStreamingEnabled, spanToJSON } from '@sentry/core';
import { SENTRY_OP } from '@sentry/conventions/attributes';
import { addResourceSpans } from './entries';

interface ResourcesOptions {
  /**
   * Resource spans with `op`s matching strings in the array will not be emitted.
   *
   * Default: []
   */
  ignoreResourceSpans?: Array<'resource.script' | 'resource.css' | 'resource.img' | 'resource.other' | string>;
}

const INTEGRATION_NAME = 'Resources';

const _resourcesIntegration = ((options: ResourcesOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      client.on('beforeIdleSpanEnd', span => {
        // Interaction idle spans also end through this hook. We match the route span by op, since
        // `browserTracingIntegration` may already have cleared its active idle span at this point.
        const op = spanToJSON(span).attributes?.[SENTRY_OP];
        if (op !== 'pageload' && op !== 'navigation') {
          return;
        }

        addResourceSpans(span, {
          ignoreResourceSpans: options.ignoreResourceSpans,
          spanStreamingEnabled: hasSpanStreamingEnabled(client),
        });
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds `resource.*` spans for the scripts, stylesheets, images and other resources loaded during a
 * pageload or navigation.
 */
export const resourcesIntegration = defineIntegration(_resourcesIntegration);
