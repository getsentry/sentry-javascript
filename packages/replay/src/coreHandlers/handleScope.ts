import { Breadcrumb, Scope } from '@sentry/types';

import { createBreadcrumb } from '../util/createBreadcrumb';

let _LAST_BREADCRUMB: null | Breadcrumb = null;

export function handleScope(scope: Scope): Breadcrumb | null {
  // TODO: remove ignores here
  // @ts-ignore using private val
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const newBreadcrumb = scope._breadcrumbs[scope._breadcrumbs.length - 1];

  // Listener can be called when breadcrumbs have not changed, so we store the
  // reference to the last crumb and only return a crumb if it has changed
  if (_LAST_BREADCRUMB === newBreadcrumb || !newBreadcrumb) {
    return null;
  }

  _LAST_BREADCRUMB = newBreadcrumb;

  if (
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    ['fetch', 'xhr', 'sentry.event', 'sentry.transaction'].includes(newBreadcrumb.category) ||
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    newBreadcrumb.category?.startsWith('ui.')
  ) {
    return null;
  }

  return createBreadcrumb(newBreadcrumb);
}
