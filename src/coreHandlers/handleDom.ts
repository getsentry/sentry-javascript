import { Breadcrumb } from '@sentry/types';
import { htmlTreeAsString } from '@sentry/utils';
import { record } from 'rrweb';

import { createBreadcrumb } from '../util/createBreadcrumb';

export function handleDom(handlerData: any): Breadcrumb | null {
  // Taken from https://github.com/getsentry/sentry-javascript/blob/master/packages/browser/src/integrations/breadcrumbs.ts#L112
  let target;
  let targetNode;

  // Accessing event.target can throw (see getsentry/raven-js#838, #768)
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    targetNode = (handlerData.event.target as Node) || (handlerData.event as unknown as Node);
    target = htmlTreeAsString(targetNode);
  } catch (e) {
    target = '<unknown>';
  }

  if (target.length === 0) {
    return null;
  }

  return createBreadcrumb({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    category: `ui.${handlerData.name}`,
    message: target,
    data: {
      // Not sure why this errors, Node should be correct (Argument of type 'Node' is not assignable to parameter of type 'INode')
      ...(targetNode ? { nodeId: record.mirror.getId(targetNode as any) } : {}),
    },
  });
}
