import { EventType } from '@sentry-internal/rrweb';
import type { Breadcrumb } from '@sentry/types';
import { normalize } from '@sentry/utils';

import type { ReplayContainer } from '../../types';

/**
 * Add a breadcrumb event to replay.
 */
export function addBreadcrumbEvent(replay: ReplayContainer, breadcrumb: Breadcrumb): void {
  if (breadcrumb.category === 'sentry.transaction') {
    return;
  }

  if (['ui.click', 'ui.input'].includes(breadcrumb.category as string)) {
    replay.triggerUserActivity();
  } else {
    replay.checkAndHandleExpiredSession();
  }

  replay.addUpdate(() => {
    // This should never reject
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    replay.throttledAddEvent({
      type: EventType.Custom,
      // TODO: We were converting from ms to seconds for breadcrumbs, spans,
      // but maybe we should just keep them as milliseconds
      timestamp: (breadcrumb.timestamp || 0) * 1000,
      data: {
        tag: 'breadcrumb',
        // normalize to max. 10 depth and 1_000 properties per object
        payload: normalize(breadcrumb, 10, 1_000),
      },
    });

    // Do not flush after console log messages
    return breadcrumb.category === 'console';
  });
}
