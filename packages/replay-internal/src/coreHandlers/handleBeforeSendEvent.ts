import type { ErrorEvent, Event } from '@sentry/types';
import { getLocationHref } from '@sentry/utils';

import type { ReplayContainer } from '../types';
import { createBreadcrumb } from '../util/createBreadcrumb';
import { isErrorEvent } from '../util/eventUtils';
import { addBreadcrumbEvent } from './util/addBreadcrumbEvent';

type BeforeSendEventCallback = (event: Event) => void;

/**
 * Returns a listener to be added to `client.on('afterSendErrorEvent, listener)`.
 */
export function handleBeforeSendEvent(replay: ReplayContainer): BeforeSendEventCallback {
  return (event: Event) => {
    if (!replay.isEnabled() || !isErrorEvent(event)) {
      return;
    }

    handleHydrationError(replay, event);
  };
}

function handleHydrationError(replay: ReplayContainer, event: ErrorEvent): void {
  const exceptionValue =
    event.exception && event.exception.values && event.exception.values[0] && event.exception.values[0].value;
  if (typeof exceptionValue !== 'string') {
    return;
  }

  if (
    // Only matches errors in production builds of react-dom
    // Example https://reactjs.org/docs/error-decoder.html?invariant=423
    // With newer React versions, the messages changed to a different website https://react.dev/errors/418
    exceptionValue.match(
      /(reactjs\.org\/docs\/error-decoder\.html\?invariant=|react\.dev\/errors\/)(418|419|422|423|425)/,
    ) ||
    // Development builds of react-dom
    // Error 1: Hydration failed because the initial UI does not match what was rendered on the server.
    // Error 2: Text content does not match server-rendered HTML. Warning: Text content did not match.
    exceptionValue.match(/(does not match server-rendered HTML|Hydration failed because)/i)
  ) {
    const breadcrumb = createBreadcrumb({
      category: 'replay.hydrate-error',
      data: {
        url: getLocationHref(),
      },
    });
    addBreadcrumbEvent(replay, breadcrumb);
  }
}
