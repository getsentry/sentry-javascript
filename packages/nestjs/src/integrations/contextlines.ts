import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { contextLinesIntegration as originalContextLinesIntegration } from '@sentry/node';

const _contextLinesIntegration = ((options?: { frameContextLines?: number }) => {
  return originalContextLinesIntegration({
    ...options,
    // Nest.js always enabled this, without an easy way for us to detect this
    // so we just enable it by default
    // see: https://github.com/nestjs/nest-cli/blob/f5dbb573df1fe103139026a36b6d0efe65e8e985/actions/start.action.ts#L220
    hasSourceMaps: true,
  });
}) satisfies IntegrationFn;

/**
 * Capture the lines before and after the frame's context.
 *
 * A Nest-specific variant of the node-core contextLineIntegration.
 * This has source maps enabled by default, as Nest.js enables this under the hood.
 */
export const contextLinesIntegration = defineIntegration(_contextLinesIntegration);
