/**
 * Checks whether given value's type is an Element instance.
 *
 * Returns false if `Element` is not available in the current runtime.
 */
export function isElement(wat: unknown): boolean {
  if (typeof Element === 'undefined') {
    return false;
  }
  try {
    return wat instanceof Element;
  } catch {
    return false;
  }
}
