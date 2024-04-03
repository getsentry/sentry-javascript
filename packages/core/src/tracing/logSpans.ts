import type { Span } from '@sentry/types';
import { logger } from '@sentry/utils';
import { DEBUG_BUILD } from '../debug-build';
import { getRootSpan, spanIsSampled, spanToJSON } from '../utils/spanUtils';

/**
 * Print a log message for a started span.
 */
export function logSpanStart(span: Span): void {
  if (!DEBUG_BUILD) return;

  const { description = '< unknown name >', op = '< unknown op >', parent_span_id: parentSpanId } = spanToJSON(span);
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
}

/**
 * Print a log message for an ended span.
 */
export function logSpanEnd(span: Span): void {
  if (!DEBUG_BUILD) return;

  const { description = '< unknown name >', op = '< unknown op >' } = spanToJSON(span);
  const { spanId } = span.spanContext();
  const rootSpan = getRootSpan(span);
  const isRootSpan = rootSpan === span;

  const msg = `[Tracing] Finishing "${op}" ${isRootSpan ? 'root ' : ''}span "${description}" with ID ${spanId}`;
  logger.log(msg);
}
