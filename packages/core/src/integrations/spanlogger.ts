import type { IntegrationFn } from '@sentry/types';
import { logger } from '@sentry/utils';
import { DEBUG_BUILD } from '../debug-build';
import { defineIntegration } from '../integration';
import { getRootSpan, spanIsSampled, spanToJSON } from '../utils/spanUtils';

const _spanLoggerIntegration = (() => {
  return {
    name: 'SpanLogger',
    setup(client) {
      if (!DEBUG_BUILD) return;

      client.on('spanStart', span => {
        const {
          description = '< unknown name >',
          op = '< unknown op >',
          parent_span_id: parentSpanId,
        } = spanToJSON(span);
        const { spanId } = span.spanContext();

        const sampled = spanIsSampled(span);
        const rootSpan = getRootSpan(span);
        const isRootSpan = rootSpan === span;

        const header = `[Tracing] Starting ${sampled ? 'sampled' : 'unsampled'} ${isRootSpan ? 'root ' : ''}span`;

        const infoParts: string[] = [`op: ${op}`, `name: ${description}`, `ID: ${spanId}`];

        if (parentSpanId) {
          infoParts.push(`parent ID: ${parentSpanId}`);
        }

        if (!isRootSpan) {
          const { op, description } = spanToJSON(rootSpan);
          infoParts.push(`root ID: ${rootSpan.spanContext().spanId}`);
          if (op) {
            infoParts.push(`root op: ${op}`);
          }
          if (description) {
            infoParts.push(`root description: ${description}`);
          }
        }

        logger.log(`${header}
  ${infoParts.join('\n  ')}`);
      });

      client.on('spanEnd', span => {
        const { description = '< unknown name >', op = '< unknown op >' } = spanToJSON(span);
        const { spanId } = span.spanContext();
        const rootSpan = getRootSpan(span);
        const isRootSpan = rootSpan === span;

        const msg = `[Tracing] Finishing "${op}" ${isRootSpan ? 'root ' : ''}span "${description}" with ID ${spanId}`;
        logger.log(msg);
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Log span information to the debugger.
 * This will not do anything if DEUBG_BUILD is disabled.
 */
export const spanLoggerIntegration = defineIntegration(_spanLoggerIntegration);
