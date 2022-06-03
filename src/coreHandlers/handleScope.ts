import { Scope } from '@sentry/hub';

export function handleScope(scope: Scope) {
  //@ts-expect-error using private val
  const newBreadcrumb = scope._breadcrumbs[scope._breadcrumbs.length - 1];

  if (
    ['fetch', 'xhr', 'sentry.event'].includes(newBreadcrumb.category) ||
    newBreadcrumb.category.startsWith('ui.')
  ) {
    return null;
  }

  return { type: 'default', ...newBreadcrumb };
}
