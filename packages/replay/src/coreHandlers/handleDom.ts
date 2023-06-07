import type { INode } from '@sentry-internal/rrweb-snapshot';
import { NodeType } from '@sentry-internal/rrweb-snapshot';
import type { Breadcrumb } from '@sentry/types';
import { htmlTreeAsString } from '@sentry/utils';

import { SLOW_CLICK_SCROLL_TIMEOUT, SLOW_CLICK_THRESHOLD } from '../constants';
import type { ReplayContainer, SlowClickConfig } from '../types';
import { createBreadcrumb } from '../util/createBreadcrumb';
import { detectSlowClick } from './handleSlowClick';
import { addBreadcrumbEvent } from './util/addBreadcrumbEvent';
import { getAttributesToRecord } from './util/getAttributesToRecord';

export interface DomHandlerData {
  name: string;
  event: Node | { target: EventTarget };
}

export const handleDomListener: (replay: ReplayContainer) => (handlerData: DomHandlerData) => void = (
  replay: ReplayContainer,
) => {
  const { slowClickTimeout, slowClickIgnoreSelectors } = replay.getOptions();

  const slowClickConfig: SlowClickConfig | undefined = slowClickTimeout
    ? {
        threshold: Math.min(SLOW_CLICK_THRESHOLD, slowClickTimeout),
        timeout: slowClickTimeout,
        scrollTimeout: SLOW_CLICK_SCROLL_TIMEOUT,
        ignoreSelector: slowClickIgnoreSelectors ? slowClickIgnoreSelectors.join(',') : '',
      }
    : undefined;

  return (handlerData: DomHandlerData): void => {
    if (!replay.isEnabled()) {
      return;
    }

    const result = handleDom(handlerData);

    if (!result) {
      return;
    }

    const isClick = handlerData.name === 'click';
    const event = isClick && (handlerData.event as PointerEvent);
    // Ignore clicks if ctrl/alt/meta keys are held down as they alter behavior of clicks (e.g. open in new tab)
    if (isClick && slowClickConfig && event && !event.altKey && !event.metaKey && !event.ctrlKey) {
      detectSlowClick(
        replay,
        slowClickConfig,
        result as Breadcrumb & { timestamp: number },
        getClickTargetNode(handlerData.event) as HTMLElement,
      );
    }

    addBreadcrumbEvent(replay, result);
  };
};

/** Get the base DOM breadcrumb. */
export function getBaseDomBreadcrumb(target: Node | INode | null, message: string): Breadcrumb {
  // `__sn` property is the serialized node created by rrweb
  const serializedNode = target && isRrwebNode(target) && target.__sn.type === NodeType.Element ? target.__sn : null;

  return {
    message,
    data: serializedNode
      ? {
          nodeId: serializedNode.id,
          node: {
            id: serializedNode.id,
            tagName: serializedNode.tagName,
            textContent: target
              ? Array.from(target.childNodes)
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
  };
}

/**
 * An event handler to react to DOM events.
 * Exported for tests.
 */
export function handleDom(handlerData: DomHandlerData): Breadcrumb | null {
  const { target, message } = getDomTarget(handlerData);

  return createBreadcrumb({
    category: `ui.${handlerData.name}`,
    ...getBaseDomBreadcrumb(target, message),
  });
}

function getDomTarget(handlerData: DomHandlerData): { target: Node | INode | null; message: string } {
  const isClick = handlerData.name === 'click';

  let message: string | undefined;
  let target: Node | INode | null = null;

  // Accessing event.target can throw (see getsentry/raven-js#838, #768)
  try {
    target = isClick ? getClickTargetNode(handlerData.event) : getTargetNode(handlerData.event);
    message = htmlTreeAsString(target, { maxStringLength: 200 }) || '<unknown>';
  } catch (e) {
    message = '<unknown>';
  }

  return { target, message };
}

function isRrwebNode(node: EventTarget): node is INode {
  return '__sn' in node;
}

function getTargetNode(event: Node | { target: EventTarget | null }): Node | INode | null {
  if (isEventWithTarget(event)) {
    return event.target as Node | null;
  }

  return event;
}

const INTERACTIVE_SELECTOR = 'button,a';

// For clicks, we check if the target is inside of a button or link
// If so, we use this as the target instead
// This is useful because if you click on the image in <button><img></button>,
// The target will be the image, not the button, which we don't want here
function getClickTargetNode(event: DomHandlerData['event']): Node | INode | null {
  const target = getTargetNode(event);

  if (!target || !(target instanceof Element)) {
    return target;
  }

  const closestInteractive = target.closest(INTERACTIVE_SELECTOR);
  return closestInteractive || target;
}

function isEventWithTarget(event: unknown): event is { target: EventTarget | null } {
  return typeof event === 'object' && !!event && 'target' in event;
}
