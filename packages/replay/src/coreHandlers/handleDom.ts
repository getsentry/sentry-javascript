import type { INode } from '@sentry-internal/rrweb-snapshot';
import { NodeType } from '@sentry-internal/rrweb-snapshot';
import type { Breadcrumb } from '@sentry/types';
import { htmlTreeAsString } from '@sentry/utils';

import type { ReplayContainer } from '../types';
import { createBreadcrumb } from '../util/createBreadcrumb';
import { addBreadcrumbEvent } from './util/addBreadcrumbEvent';
import { getAttributesToRecord } from './util/getAttributesToRecord';

export interface DomHandlerData {
  name: string;
  event: Node | { target: Node };
}

export const handleDomListener: (replay: ReplayContainer) => (handlerData: DomHandlerData) => void =
  (replay: ReplayContainer) =>
  (handlerData: DomHandlerData): void => {
    if (!replay.isEnabled()) {
      return;
    }

    const result = handleDom(handlerData);

    if (!result) {
      return;
    }

    addBreadcrumbEvent(replay, result);
  };

/**
 * An event handler to react to DOM events.
 * Exported for tests only.
 */
export function handleDom(handlerData: DomHandlerData): Breadcrumb | null {
  let target;
  let targetNode: Node | INode | undefined;

  const isClick = handlerData.name === 'click';

  // Accessing event.target can throw (see getsentry/raven-js#838, #768)
  try {
    targetNode = isClick ? getClickTargetNode(handlerData.event) : getTargetNode(handlerData.event);
    target = htmlTreeAsString(targetNode, { maxStringLength: 200 });
  } catch (e) {
    target = '<unknown>';
  }

  // `__sn` property is the serialized node created by rrweb
  const serializedNode =
    targetNode && '__sn' in targetNode && targetNode.__sn.type === NodeType.Element ? targetNode.__sn : null;

  return createBreadcrumb({
    category: `ui.${handlerData.name}`,
    message: target,
    data: serializedNode
      ? {
          nodeId: serializedNode.id,
          node: {
            id: serializedNode.id,
            tagName: serializedNode.tagName,
            textContent: targetNode
              ? Array.from(targetNode.childNodes)
                  .map(
                    (node: Node | INode) => '__sn' in node && node.__sn.type === NodeType.Text && node.__sn.textContent,
                  )
                  .filter(Boolean) // filter out empty values
                  .map(text => (text as string).trim())
                  .join('')
              : '',
            attributes: getAttributesToRecord(serializedNode.attributes),
          },
        }
      : {},
  });
}

function getTargetNode(event: DomHandlerData['event']): Node {
  if (isEventWithTarget(event)) {
    return event.target;
  }

  return event;
}

const INTERACTIVE_SELECTOR = 'button,a';

// For clicks, we check if the target is inside of a button or link
// If so, we use this as the target instead
// This is useful because if you click on the image in <button><img></button>,
// The target will be the image, not the button, which we don't want here
function getClickTargetNode(event: DomHandlerData['event']): Node {
  const target = getTargetNode(event);

  if (!target || !(target instanceof Element)) {
    return target;
  }

  const closestInteractive = target.closest(INTERACTIVE_SELECTOR);
  return closestInteractive || target;
}

function isEventWithTarget(event: unknown): event is { target: Node } {
  return !!(event as { target?: Node }).target;
}
