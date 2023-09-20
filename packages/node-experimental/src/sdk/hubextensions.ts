import type { startTransaction } from '@sentry/core';
import { addTracingExtensions as _addTracingExtensions, getMainCarrier } from '@sentry/core';
import type { Breadcrumb, Hub, Transaction } from '@sentry/types';
import { dateTimestampInSeconds } from '@sentry/utils';

import type { TransactionWithBreadcrumbs } from '../types';

const DEFAULT_MAX_BREADCRUMBS = 100;

/**
 * Add tracing extensions, ensuring a patched `startTransaction` to work with OTEL.
 */
export function addTracingExtensions(): void {
  _addTracingExtensions();

  const carrier = getMainCarrier();
  if (!carrier.__SENTRY__) {
    return;
  }

  carrier.__SENTRY__.extensions = carrier.__SENTRY__.extensions || {};
  if (carrier.__SENTRY__.extensions.startTransaction) {
    carrier.__SENTRY__.extensions.startTransaction = getPatchedStartTransaction(
      carrier.__SENTRY__.extensions.startTransaction as typeof startTransaction,
    );
  }
}

/**
 *  We patch the `startTransaction` function to ensure we create a `TransactionWithBreadcrumbs` instead of a regular `Transaction`.
 */
function getPatchedStartTransaction(_startTransaction: typeof startTransaction): typeof startTransaction {
  return function (this: Hub, ...args) {
    const transaction = _startTransaction.apply(this, args);

    return patchTransaction(transaction);
  };
}

function patchTransaction(transaction: Transaction): TransactionWithBreadcrumbs {
  return new Proxy(transaction as TransactionWithBreadcrumbs, {
    get(target, prop, receiver) {
      if (prop === 'addBreadcrumb') {
        return addBreadcrumb;
      }
      if (prop === 'getBreadcrumbs') {
        return getBreadcrumbs;
      }
      if (prop === '_breadcrumbs') {
        const breadcrumbs = Reflect.get(target, prop, receiver);
        return breadcrumbs || [];
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/** Add a breadcrumb to a transaction. */
function addBreadcrumb(this: TransactionWithBreadcrumbs, breadcrumb: Breadcrumb, maxBreadcrumbs?: number): void {
  const maxCrumbs = typeof maxBreadcrumbs === 'number' ? maxBreadcrumbs : DEFAULT_MAX_BREADCRUMBS;

  // No data has been changed, so don't notify scope listeners
  if (maxCrumbs <= 0) {
    return;
  }

  const mergedBreadcrumb = {
    timestamp: dateTimestampInSeconds(),
    ...breadcrumb,
  };

  const breadcrumbs = this._breadcrumbs;
  breadcrumbs.push(mergedBreadcrumb);
  this._breadcrumbs = breadcrumbs.length > maxCrumbs ? breadcrumbs.slice(-maxCrumbs) : breadcrumbs;
}

/** Get all breadcrumbs from a transaction. */
function getBreadcrumbs(this: TransactionWithBreadcrumbs): Breadcrumb[] {
  return this._breadcrumbs;
}
