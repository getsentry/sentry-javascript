import { Breadcrumb } from '@sentry/types';
import { htmlTreeAsString } from '@sentry/utils';
import { record } from 'rrweb';

import { createBreadcrumb } from '../util/createBreadcrumb';

export interface DomHandlerData {
  name: string;
  event: Node | { target: Node };
}

/**
 * An event handler to react to DOM events.
 */
export function handleDom(handlerData: DomHandlerData): Breadcrumb | null {
  // Taken from https://github.com/getsentry/sentry-javascript/blob/master/packages/browser/src/integrations/breadcrumbs.ts#L112
  let target;
  let targetNode;

  // Accessing event.target can throw (see getsentry/raven-js#838, #768)
  try {
    targetNode = getTargetNode(handlerData);
    target = htmlTreeAsString(targetNode);
  } catch (e) {
    target = '<unknown>';
  }

  if (target.length === 0) {
    return null;
  }

  return createBreadcrumb({
    category: `ui.${handlerData.name}`,
    message: target,
    data: {
      // Not sure why this errors, Node should be correct (Argument of type 'Node' is not assignable to parameter of type 'INode')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(targetNode ? { nodeId: record.mirror.getId(targetNode as any) } : {}),
    },
  });
}

function getTargetNode(handlerData: DomHandlerData): Node {
  if (isEventWithTarget(handlerData.event)) {
    return handlerData.event.target;
  }

  return handlerData.event;
}

function isEventWithTarget(event: unknown): event is { target: Node } {
  return !!(event as { target?: Node }).target;
}
