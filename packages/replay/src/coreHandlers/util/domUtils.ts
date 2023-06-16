import type { INode } from '@sentry-internal/rrweb-snapshot';

export interface DomHandlerData {
  name: string;
  event: Node | { target: EventTarget };
}

const INTERACTIVE_SELECTOR = 'button,a';

/**
 * For clicks, we check if the target is inside of a button or link
 * If so, we use this as the target instead
 * This is useful because if you click on the image in <button><img></button>,
 * The target will be the image, not the button, which we don't want here
 */
export function getClickTargetNode(event: DomHandlerData['event'] | MouseEvent): Node | INode | null {
  const target = getTargetNode(event);

  if (!target || !(target instanceof Element)) {
    return target;
  }

  const closestInteractive = target.closest(INTERACTIVE_SELECTOR);
  return closestInteractive || target;
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
