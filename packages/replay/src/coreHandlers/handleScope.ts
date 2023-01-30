import type { Breadcrumb, Scope } from '@sentry/types';

import type { ReplayContainer } from '../types';
import { createBreadcrumb } from '../util/createBreadcrumb';
import { addBreadcrumbEvent } from './addBreadcrumbEvent';

let _LAST_BREADCRUMB: null | Breadcrumb = null;

export const handleScopeListener: (replay: ReplayContainer) => (scope: Scope) => void =
  (replay: ReplayContainer) =>
  (scope: Scope): void => {
    if (!replay.isEnabled()) {
      return;
    }

    const result = handleScope(scope);

    if (!result) {
      return;
    }

    addBreadcrumbEvent(replay, result);
  };

/**
 * An event handler to handle scope changes.
 */
export function handleScope(scope: Scope): Breadcrumb | null {
  if (typeof scope.getLastBreadcrumb !== 'function') {
    return null;
  }

  const newBreadcrumb = scope.getLastBreadcrumb();

  // Listener can be called when breadcrumbs have not changed, so we store the
  // reference to the last crumb and only return a crumb if it has changed
  if (_LAST_BREADCRUMB === newBreadcrumb || !newBreadcrumb) {
    return null;
  }

  _LAST_BREADCRUMB = newBreadcrumb;

  if (
    newBreadcrumb.category &&
    (['fetch', 'xhr', 'sentry.event', 'sentry.transaction'].includes(newBreadcrumb.category) ||
      newBreadcrumb.category.startsWith('ui.'))
  ) {
    return null;
  }

  return createBreadcrumb(newBreadcrumb);
}
