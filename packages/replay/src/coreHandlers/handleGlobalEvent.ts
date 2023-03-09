import { addBreadcrumb } from '@sentry/core';
import type { ErrorEvent, Event, EventHint } from '@sentry/types';
import { logger } from '@sentry/utils';

import { REPLAY_EVENT_NAME } from '../constants';
import type { ReplayContainer } from '../types';
import { isRrwebError } from '../util/isRrwebError';
import { handleAfterSendError } from './handleAfterSendError';

/**
 * Returns a listener to be added to `addGlobalEventProcessor(listener)`.
 */
export function handleGlobalEventListener(
  replay: ReplayContainer,
  includeErrorHandling = false,
): (event: Event, hint: EventHint) => Event | null {
  const errorHandler = includeErrorHandling ? handleAfterSendError(replay) : undefined;

  return (event: Event, hint: EventHint) => {
    // Do not apply replayId to the root event
    if (event.type === REPLAY_EVENT_NAME) {
      // Replays have separate set of breadcrumbs, do not include breadcrumbs
      // from core SDK
      delete event.breadcrumbs;
      return event;
    }

    // Unless `captureExceptions` is enabled, we want to ignore errors coming from rrweb
    // As there can be a bunch of stuff going wrong in internals there, that we don't want to bubble up to users
    if (isRrwebError(event, hint) && !replay.getOptions()._experiments.captureExceptions) {
      __DEBUG_BUILD__ && logger.log('[Replay] Ignoring error from rrweb internals', event);
      return null;
    }

    // Only tag transactions with replayId if not waiting for an error
    // @ts-ignore private
    if (!event.type || replay.recordingMode === 'session') {
      event.tags = { ...event.tags, replayId: replay.getSessionId() };
    }

    // Collect traceIds in _context regardless of `recordingMode` - if it's true,
    // _context gets cleared on every checkout
    if (event.type === 'transaction' && event.contexts && event.contexts.trace && event.contexts.trace.trace_id) {
      replay.getContext().traceIds.add(event.contexts.trace.trace_id as string);
      return event;
    }

    if (__DEBUG_BUILD__ && replay.getOptions()._experiments.traceInternals) {
      const exc = getEventExceptionValues(event);
      addInternalBreadcrumb({
        message: `Tagging event (${event.event_id}) - ${event.message} - ${exc.type}: ${exc.value}`,
      });
    }

    if (errorHandler && !event.type) {
      // Pretend the error had a 200 response so we capture it
      errorHandler(event as ErrorEvent, { statusCode: 200 });
    }

    return event;
  };
}

function addInternalBreadcrumb(arg: Parameters<typeof addBreadcrumb>[0]): void {
  const { category, level, message, ...rest } = arg;

  addBreadcrumb({
    category: category || 'console',
    level: level || 'debug',
    message: `[debug]: ${message}`,
    ...rest,
  });
}

function getEventExceptionValues(event: Event): { type: string; value: string } {
  return {
    type: 'Unknown',
    value: 'n/a',
    ...(event.exception && event.exception.values && event.exception.values[0]),
  };
}
