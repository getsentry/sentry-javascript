import type { Breadcrumb } from '@sentry/types';
import { timestampInSeconds } from '@sentry/utils';

import { WINDOW } from '../constants';
import type { ReplayContainer } from '../types';
import { addBreadcrumbEvent } from './util/addBreadcrumbEvent';

let clickCounter = 0;

const RAGE_CLICK_TIME = 1_000;

/**
 * Detect if a rage click happened.
 * This is defined if more than 4 clicks happen in 1s.
 */
export function detectRageClick(replay: ReplayContainer, clickBreadcrumb: Breadcrumb): void {
  clickCounter++;

  if (clickCounter === 4) {
    const breadcrumb = {
      message: clickBreadcrumb.message,
      timestamp: timestampInSeconds(),
      category: 'ui.rageClickDetected',
      data: {
        ...clickBreadcrumb.data,
        url: WINDOW.location.href,
        route: replay.getCurrentRoute(),
        metric: true,
      },
    };

    addBreadcrumbEvent(replay, breadcrumb);
  }

  setTimeout(() => clickCounter--, RAGE_CLICK_TIME);
}
