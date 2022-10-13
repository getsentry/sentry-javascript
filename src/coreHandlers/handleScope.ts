import { Breadcrumb, Scope } from '@sentry/types';

import createBreadcrumb from '../util/createBreadcrumb';

let _LAST_BREADCRUMB: null | Breadcrumb = null;

export function handleScope(scope: Scope) {
  //@ts-expect-error using private val
  const newBreadcrumb = scope._breadcrumbs[scope._breadcrumbs.length - 1];

  // Listener can be called when breadcrumbs have not changed, so we store the
  // reference to the last crumb and only return a crumb if it has changed
  if (_LAST_BREADCRUMB === newBreadcrumb || !newBreadcrumb) {
    return null;
  }

  _LAST_BREADCRUMB = newBreadcrumb;

  if (
    ['fetch', 'xhr', 'sentry.event', 'sentry.transaction'].includes(
      newBreadcrumb.category
    ) ||
    newBreadcrumb.category?.startsWith('ui.')
  ) {
    return null;
  }

  return createBreadcrumb(newBreadcrumb);
}
