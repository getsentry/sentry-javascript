import type { INode } from '@sentry-internal/rrweb-snapshot';

const INTERACTIVE_SELECTOR = 'button,a';

/** Get the closest interactive parent element, or else return the given element. */
export function getClosestInteractive(element: Element): Element {
  const closestInteractive = element.closest(INTERACTIVE_SELECTOR);
  return closestInteractive || element;
}

/**
 * For clicks, we check if the target is inside of a button or link
 * If so, we use this as the target instead
 * This is useful because if you click on the image in <button><img></button>,
 * The target will be the image, not the button, which we don't want here
 */
export function getClickTargetNode(event: Event | MouseEvent | Node): Node | INode | null {
  const target = getTargetNode(event);

  if (!target || !(target instanceof Element)) {
    return target;
  }

  return getClosestInteractive(target);
}

/** Get the event target node. */
export function getTargetNode(event: Node | { target: EventTarget | null }): Node | INode | null {
  if (isEventWithTarget(event)) {
    return event.target as Node | null;
  }

  return event;
}

function isEventWithTarget(event: unknown): event is { target: EventTarget | null } {
  return typeof event === 'object' && !!event && 'target' in event;
}
