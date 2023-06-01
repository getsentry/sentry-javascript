import type { Breadcrumb, Scope } from '@sentry/types';
import { normalize } from '@sentry/utils';

import { CONSOLE_ARG_MAX_SIZE } from '../constants';
import type { ReplayContainer } from '../types';
import type { ReplayFrame } from '../types/replayFrame';
import { createBreadcrumb } from '../util/createBreadcrumb';
import { fixJson } from '../util/truncateJson/fixJson';
import { addBreadcrumbEvent } from './util/addBreadcrumbEvent';

let _LAST_BREADCRUMB: null | Breadcrumb = null;

type BreadcrumbWithCategory = Required<Pick<Breadcrumb, 'category'>>;

function isBreadcrumbWithCategory(breadcrumb: Breadcrumb): breadcrumb is BreadcrumbWithCategory {
  return !!breadcrumb.category;
}

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
  // TODO (v8): Remove this guard. This was put in place because we introduced
  // Scope.getLastBreadcrumb mid-v7 which caused incompatibilities with older SDKs.
  // For now, we'll just return null if the method doesn't exist but we should eventually
  // get rid of this guard.
  const newBreadcrumb = scope.getLastBreadcrumb && scope.getLastBreadcrumb();

  // Listener can be called when breadcrumbs have not changed, so we store the
  // reference to the last crumb and only return a crumb if it has changed
  if (_LAST_BREADCRUMB === newBreadcrumb || !newBreadcrumb) {
    return null;
  }

  _LAST_BREADCRUMB = newBreadcrumb;

  if (
    !isBreadcrumbWithCategory(newBreadcrumb) ||
    ['fetch', 'xhr', 'sentry.event', 'sentry.transaction'].includes(newBreadcrumb.category) ||
    newBreadcrumb.category.startsWith('ui.')
  ) {
    return null;
  }

  if (newBreadcrumb.category === 'console') {
    return normalizeConsoleBreadcrumb(newBreadcrumb);
  }

  return createBreadcrumb(newBreadcrumb);
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
          const fixedJson = fixJson(stringified.slice(0, CONSOLE_ARG_MAX_SIZE));
          const json = JSON.parse(fixedJson);
          // We only set this after JSON.parse() was successfull, so we know we didn't run into `catch`
          isTruncated = true;
          return json;
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
