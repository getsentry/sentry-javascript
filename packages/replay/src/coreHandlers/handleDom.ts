import { record } from '@sentry-internal/rrweb';
import type { serializedElementNodeWithId, serializedNodeWithId } from '@sentry-internal/rrweb-snapshot';
import { NodeType } from '@sentry-internal/rrweb-snapshot';
import type { Breadcrumb } from '@sentry/types';
import { getElementIdentifier } from '@sentry/utils';

import type { ReplayContainer } from '../types';
import { createBreadcrumb } from '../util/createBreadcrumb';
import { handleClick } from './handleClick';
import { addBreadcrumbEvent } from './util/addBreadcrumbEvent';
import type { DomHandlerData } from './util/domUtils';
import { getClickTargetNode, getTargetNode } from './util/domUtils';
import { getAttributesToRecord } from './util/getAttributesToRecord';

export const handleDomListener: (replay: ReplayContainer) => (handlerData: DomHandlerData) => void = (
  replay: ReplayContainer,
) => {
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
    // Ignore clicks if ctrl/alt/meta/shift keys are held down as they alter behavior of clicks (e.g. open in new tab)
    if (
      isClick &&
      replay.clickDetector &&
      event &&
      !event.altKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey
    ) {
      handleClick(
        replay.clickDetector,
        result as Breadcrumb & { timestamp: number; data: { nodeId: number } },
        getClickTargetNode(handlerData.event) as HTMLElement,
      );
    }

    addBreadcrumbEvent(replay, result);
  };
};

/** Get the base DOM breadcrumb. */
export function getBaseDomBreadcrumb(target: Node | null, message: string): Breadcrumb {
  const nodeId = record.mirror.getId(target);
  const node = nodeId && record.mirror.getNode(nodeId);
  const meta = node && record.mirror.getMeta(node);
  const element = meta && isElement(meta) ? meta : null;

  return {
    message,
    data: element
      ? {
          nodeId,
          node: {
            id: nodeId,
            tagName: element.tagName,
            textContent: Array.from(element.childNodes)
              .map((node: serializedNodeWithId) => node.type === NodeType.Text && node.textContent)
              .filter(Boolean) // filter out empty values
              .map(text => (text as string).trim())
              .join(''),
            attributes: getAttributesToRecord(element.attributes),
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

function getDomTarget(handlerData: DomHandlerData): { target: Node | null; message: string } {
  const isClick = handlerData.name === 'click';

  let message: string | undefined;
  let target: Node | null = null;

  // Accessing event.target can throw (see getsentry/raven-js#838, #768)
  try {
    target = isClick ? getClickTargetNode(handlerData.event) : getTargetNode(handlerData.event);
    message = getElementIdentifier(target, { maxStringLength: 200 }) || '<unknown>';
  } catch (e) {
    message = '<unknown>';
  }

  return { target, message };
}

function isElement(node: serializedNodeWithId): node is serializedElementNodeWithId {
  return node.type === NodeType.Element;
}
