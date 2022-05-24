import { SentryReplay } from '@';
import { Scope } from '@sentry/hub';
import { addInstrumentationHandler, htmlTreeAsString } from '@sentry/utils';

export default function addInstrumentationListeners(
  scope: Scope,
  replay: SentryReplay
) {
  scope.addScopeListener(scopeListenerCallback.bind(replay));
  addInstrumentationHandler('dom', domCallback.bind(replay));
  addInstrumentationHandler('xhr', xhrCallback.bind(replay));
  addInstrumentationHandler('fetch', fetchCallback.bind(replay));
}

function scopeListenerCallback(scope: Scope) {
  //@ts-expect-error using private val
  const newBreadcrumb = scope._breadcrumbs[scope._breadcrumbs.length - 1];

  if (
    ['fetch', 'xhr', 'sentry.event'].includes(newBreadcrumb.category) ||
    newBreadcrumb.category.startsWith('ui.')
  ) {
    return;
  }

  this.breadcrumbs.push({ type: 'default', ...newBreadcrumb });
}

function domCallback(handlerData: any) {
  // Taken from https://github.com/getsentry/sentry-javascript/blob/master/packages/browser/src/integrations/breadcrumbs.ts#L112
  let target;
  let targetNode;

  // Accessing event.target can throw (see getsentry/raven-js#838, #768)
  try {
    targetNode =
      (handlerData.event.target as Node) ||
      (handlerData.event as unknown as Node);
    target = htmlTreeAsString(targetNode);
  } catch (e) {
    target = '<unknown>';
  }

  if (target.length === 0) {
    return;
  }

  this.breadcrumbs.push({
    timestamp: new Date().getTime() / 1000,
    type: 'default',
    category: `ui.${handlerData.name}`,
    message: target,
    data: {
      // @ts-expect-error Not sure why this errors, Node should be correct (Argument of type 'Node' is not assignable to parameter of type 'INode')
      nodeId: targetNode ? record.mirror.getId(targetNode) : undefined,
    },
  });
}

function xhrCallback(handlerData: any) {
  // TODO: add status code into data, etc.

  if (handlerData.startTimestamp) {
    handlerData.xhr.__sentry_xhr__.startTimestamp = handlerData.startTimestamp;
  }
  if (handlerData.endTimestamp) {
    this.spans.push({
      description: handlerData.args[1],
      op: handlerData.args[0],
      startTimestamp:
        handlerData.xhr.__sentry_xhr__.startTimestamp / 1000 ||
        handlerData.endTimestamp / 1000.0,
      endTimestamp: handlerData.endTimestamp / 1000.0,
    });
  }
}

function fetchCallback(handlerData: any) {
  // TODO: add status code into data, etc.

  if (handlerData.endTimestamp) {
    this.spans.push({
      description: handlerData.args[1],
      op: handlerData.args[0],
      startTimestamp: handlerData.startTimestamp / 1000,
      endTimestamp: handlerData.endTimestamp / 1000,
    });
  }
}
