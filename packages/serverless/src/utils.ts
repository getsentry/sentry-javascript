import { Event, SDK_VERSION } from '@sentry/node';
import { addExceptionMechanism } from '@sentry/utils';

/**
 * Event processor that will override SDK details to point to the serverless SDK instead of Node,
 * as well as set correct mechanism type, which should be set to `handled: false`.
 * We do it like this, so that we don't introduce any side-effects in this module, which makes it tree-shakeable.
 * @param event Event
 * @param integration Name of the serverless integration ('AWSLambda', 'GCPFunction', etc)
 */
export function serverlessEventProcessor(integration: string): (event: Event) => Event {
  return event => {
    event.sdk = {
      ...event.sdk,
      name: 'sentry.javascript.serverless',
      integrations: [...((event.sdk && event.sdk.integrations) || []), integration],
      packages: [
        ...((event.sdk && event.sdk.packages) || []),
        {
          name: 'npm:@sentry/serverless',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };

    addExceptionMechanism(event, {
      handled: false,
    });

    return event;
  };
}
