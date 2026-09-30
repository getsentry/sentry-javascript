import { SENTRY_OP } from '@sentry/conventions/attributes';
import { DEBUG_BUILD } from '../debug-build';
import type { Span } from '../types/span';
import { debug } from '../utils/debug-logger';
import { getRootSpan, spanIsSampled, spanToJSON } from '../utils/spanUtils';

/**
 * Print a log message for a started span.
 */
export function logSpanStart(span: Span): void {
  if (!DEBUG_BUILD) return;

  const { name, op, parentSpanId } = getSpanInfo(span);
  const { spanId } = span.spanContext();

  const sampled = spanIsSampled(span);
  const rootSpan = getRootSpan(span);
  const isRootSpan = rootSpan === span;

  const header = `[Tracing] Starting ${sampled ? 'sampled' : 'unsampled'} ${isRootSpan ? 'root ' : ''}span`;

  const infoParts: string[] = [`op: ${op}`, `name: ${name}`, `ID: ${spanId}`];

  if (parentSpanId) {
    infoParts.push(`parent ID: ${parentSpanId}`);
  }

  if (!isRootSpan) {
    const { name: rootName, op: rootOp } = getSpanInfo(rootSpan);
    infoParts.push(`root ID: ${rootSpan.spanContext().spanId}`, `root op: ${rootOp}`, `root name: ${rootName}`);
  }

  debug.log(`${header}
  ${infoParts.join('\n  ')}`);
}

/**
 * Print a log message for an ended span.
 */
export function logSpanEnd(span: Span): void {
  if (!DEBUG_BUILD) return;

  const { name, op } = getSpanInfo(span);

  const { spanId } = span.spanContext();
  const rootSpan = getRootSpan(span);
  const isRootSpan = rootSpan === span;

  const msg = `[Tracing] Finishing "${op}" ${isRootSpan ? 'root ' : ''}span "${name}" with ID ${spanId}`;
  debug.log(msg);
}

function getSpanInfo(span: Span): { name: string; op: string; parentSpanId: string | undefined } {
  const {
    name = '< unknown name >',
    attributes: { [SENTRY_OP]: op = '< unknown op >' },
    parent_span_id: parentSpanId,
  } = spanToJSON(span);
  return { name, op: op as string, parentSpanId };
}
