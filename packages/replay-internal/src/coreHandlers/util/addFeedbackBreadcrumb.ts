import { EventType } from '@sentry-internal/rrweb';
import type { FeedbackEvent } from '@sentry/types';

import type { ReplayBreadcrumbFrameEvent, ReplayContainer } from '../../types';

/**
 * Add a feedback breadcrumb event to replay.
 */
export function addFeedbackBreadcrumb(replay: ReplayContainer, event: FeedbackEvent): void {
  replay.triggerUserActivity();
  replay.addUpdate(() => {
    if (!event.timestamp) {
      // Ignore events that don't have timestamps (this shouldn't happen, more of a typing issue)
      // Return true here so that we don't flush
      return true;
    }

    // This should never reject
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    replay.throttledAddEvent({
      type: EventType.Custom,
      timestamp: event.timestamp * 1000,
      data: {
        tag: 'breadcrumb',
        payload: {
          timestamp: event.timestamp,
          type: 'default',
          category: 'sentry.feedback',
          data: {
            feedbackId: event.event_id,
          },
        },
      },
    } as ReplayBreadcrumbFrameEvent);

    return false;
  });
}
