import type { ErrorEvent, Event } from '@sentry/types';

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

    handleErrorEvent(replay, event);
  };
}

function handleErrorEvent(replay: ReplayContainer, event: ErrorEvent): void {
  const exceptionValue = event.exception && event.exception.values && event.exception.values[0].value;
  if (typeof exceptionValue !== 'string') {
    return;
  }

  if (
    // Only matches errors in production builds of react-dom
    // Example https://reactjs.org/docs/error-decoder.html?invariant=423
    exceptionValue.match(/reactjs\.org\/docs\/error-decoder\.html\?invariant=(418|419|422|423|425)/) ||
    // Development builds of react-dom
    // Example Text: content did not match. Server: "A" Client: "B"
    exceptionValue.match(/(hydration|content does not match|did not match)/i)
  ) {
    const breadcrumb = createBreadcrumb({
      category: 'replay.hydrate-error',
    });
    addBreadcrumbEvent(replay, breadcrumb);
  }
}
