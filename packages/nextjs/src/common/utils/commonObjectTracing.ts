import type { PropagationContext } from '@sentry/types';

const commonMap = new WeakMap<object, PropagationContext>();

/**
 * Takes a shared (garbage collectable) object between resources, e.g. a headers object shared between Next.js server components and returns a common propagation context.
 */
export function commonObjectToPropagationContext(
  commonObject: unknown,
  propagationContext: PropagationContext,
): PropagationContext {
  if (typeof commonObject === 'object' && commonObject) {
    const memoPropagationContext = commonMap.get(commonObject);
    if (memoPropagationContext) {
      return memoPropagationContext;
    } else {
      commonMap.set(commonObject, propagationContext);
      return propagationContext;
    }
  } else {
    return propagationContext;
  }
}
