import type { Breadcrumb, BreadcrumbHint } from '@sentry/types';
import { getClient, getIsolationScope } from './currentScopes';
import { consoleSandbox } from './utils-hoist/logger';
import { dateTimestampInSeconds } from './utils-hoist/time';

/**
 * Default maximum number of breadcrumbs added to an event. Can be overwritten
 * with {@link Options.maxBreadcrumbs}.
 */
const DEFAULT_BREADCRUMBS = 100;

/**
 * Records a new breadcrumb which will be attached to future events.
 *
 * Breadcrumbs will be added to subsequent events to provide more context on
 * user's actions prior to an error or crash.
 */
export function addBreadcrumb(breadcrumb: Breadcrumb, hint?: BreadcrumbHint): void {
  const client = getClient();
  const isolationScope = getIsolationScope();

  if (!client) return;

  const { beforeBreadcrumb = null, maxBreadcrumbs = DEFAULT_BREADCRUMBS } = client.getOptions();

  if (maxBreadcrumbs <= 0) return;

  const timestamp = dateTimestampInSeconds();
  const mergedBreadcrumb = { timestamp, ...breadcrumb };
  const finalBreadcrumb = beforeBreadcrumb
    ? (consoleSandbox(() => beforeBreadcrumb(mergedBreadcrumb, hint)) as Breadcrumb | null)
    : mergedBreadcrumb;

  if (finalBreadcrumb === null) return;

  if (client.emit) {
    client.emit('beforeAddBreadcrumb', finalBreadcrumb, hint);
  }

  isolationScope.addBreadcrumb(finalBreadcrumb, maxBreadcrumbs);
}
