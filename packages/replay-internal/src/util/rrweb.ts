/**
 * Vendored in from @sentry-internal/rrweb.
 *
 * This is a copy of the function from rrweb, it is not nicely exported there.
 */
export function closestElementOfNode(node: Node | null): HTMLElement | null {
  if (!node) {
    return null;
  }

  // Catch access to node properties to avoid Firefox "permission denied" errors
  try {
    const el: HTMLElement | null = node.nodeType === node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
    return el;
  } catch {
    return null;
  }
}
