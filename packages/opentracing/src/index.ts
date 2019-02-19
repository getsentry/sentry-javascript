export { Span } from './span';
export { Tracer } from './tracer';
export { SessionTracking } from './sessiontracking';
export { initGlobalTracer } from 'opentracing/lib/global_tracer';

import { globalTracer as otGlobalTracer } from 'opentracing/lib/global_tracer';
import { Tracer } from './tracer';

/**
 * Return the global set Tracer
 */
export function globalTracer(): Tracer {
  return (otGlobalTracer() as unknown) as Tracer;
}
