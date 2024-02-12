import { getClient } from '@sentry/core';
import type { Breadcrumb } from '@sentry/types';
import { normalize } from '@sentry/utils';

import { CONSOLE_ARG_MAX_SIZE } from '../constants';
import type { ReplayContainer } from '../types';
import type { ReplayFrame } from '../types/replayFrame';
import { createBreadcrumb } from '../util/createBreadcrumb';
import { addBreadcrumbEvent } from './util/addBreadcrumbEvent';

type BreadcrumbWithCategory = Required<Pick<Breadcrumb, 'category'>>;

/**
 * Handle breadcrumbs that Sentry captures, and make sure to capture relevant breadcrumbs to Replay as well.
 */
export function handleBreadcrumbs(replay: ReplayContainer): void {
  const client = getClient();

  if (!client) {
    return;
  }

  client.on('beforeAddBreadcrumb', breadcrumb => beforeAddBreadcrumb(replay, breadcrumb));
}

function beforeAddBreadcrumb(replay: ReplayContainer, breadcrumb: Breadcrumb): void {
  if (!replay.isEnabled() || !isBreadcrumbWithCategory(breadcrumb)) {
    return;
  }

  const result = normalizeBreadcrumb(breadcrumb);
  if (result) {
    addBreadcrumbEvent(replay, result);
  }
}

/** Exported only for tests. */
export function normalizeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (
    !isBreadcrumbWithCategory(breadcrumb) ||
    [
      // fetch & xhr are handled separately,in handleNetworkBreadcrumbs
      'fetch',
      'xhr',
      // These two are breadcrumbs for emitted sentry events, we don't care about them
      'sentry.event',
      'sentry.transaction',
    ].includes(breadcrumb.category) ||
    // We capture UI breadcrumbs separately
    breadcrumb.category.startsWith('ui.')
  ) {
    return null;
  }

  if (breadcrumb.category === 'console') {
    return normalizeConsoleBreadcrumb(breadcrumb);
  }

  return createBreadcrumb(breadcrumb);
}

/** exported for tests only */
export function normalizeConsoleBreadcrumb(
  breadcrumb: Omit<Breadcrumb, 'category'> & BreadcrumbWithCategory,
): ReplayFrame {
  const args = breadcrumb.data && breadcrumb.data.arguments;

  if (!Array.isArray(args) || args.length === 0) {
    return createBreadcrumb(breadcrumb);
  }

  let isTruncated = false;

  // Avoid giant args captures
  const normalizedArgs = args.map(arg => {
    if (!arg) {
      return arg;
    }
    if (typeof arg === 'string') {
      if (arg.length > CONSOLE_ARG_MAX_SIZE) {
        isTruncated = true;
        return `${arg.slice(0, CONSOLE_ARG_MAX_SIZE)}…`;
      }

      return arg;
    }
    if (typeof arg === 'object') {
      try {
        const normalizedArg = normalize(arg, 7);
        const stringified = JSON.stringify(normalizedArg);
        if (stringified.length > CONSOLE_ARG_MAX_SIZE) {
          isTruncated = true;
          // We use the pretty printed JSON string here as a base
          return `${JSON.stringify(normalizedArg, null, 2).slice(0, CONSOLE_ARG_MAX_SIZE)}…`;
        }
        return normalizedArg;
      } catch {
        // fall back to default
      }
    }

    return arg;
  });

  return createBreadcrumb({
    ...breadcrumb,
    data: {
      ...breadcrumb.data,
      arguments: normalizedArgs,
      ...(isTruncated ? { _meta: { warnings: ['CONSOLE_ARG_TRUNCATED'] } } : {}),
    },
  });
}

function isBreadcrumbWithCategory(breadcrumb: Breadcrumb): breadcrumb is BreadcrumbWithCategory {
  return !!breadcrumb.category;
}
