import { registerErrorInstrumentation } from './errors';

/**
 * Adds tracing extensions.
 * TODO (v8): Do we still need this?? Can we solve this differently?
 */
export function addTracingExtensions(): void {
  registerErrorInstrumentation();
}
