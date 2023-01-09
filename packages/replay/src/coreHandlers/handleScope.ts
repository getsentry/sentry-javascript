import { Breadcrumb, Scope } from '@sentry/types';

import { createBreadcrumb } from '../util/createBreadcrumb';

let _LAST_BREADCRUMB: null | Breadcrumb = null;

/**
 * An event handler to handle scope changes.
 */
export function handleScope(scope: Scope): Breadcrumb | null {
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
