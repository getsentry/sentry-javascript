import { Scope } from '@sentry/core';
import type { Breadcrumb, Transaction } from '@sentry/types';
import { dateTimestampInSeconds } from '@sentry/utils';

import { getActiveSpan } from './trace';

const DEFAULT_MAX_BREADCRUMBS = 100;

/**
 * This is a fork of the base Transaction with OTEL specific stuff added.
 * Note that we do not solve this via an actual subclass, but by wrapping this in a proxy when we need it -
 * as we can't easily control all the places a transaction may be created.
 */
interface TransactionWithBreadcrumbs extends Transaction {
  _breadcrumbs: Breadcrumb[];

  /** Get all breadcrumbs added to this transaction. */
  getBreadcrumbs(): Breadcrumb[];

  /** Add a breadcrumb to this transaction. */
  addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): void;
}

/** A fork of the classic scope with some otel specific stuff. */
export class OtelScope extends Scope {
  /**
   * @inheritDoc
   */
  public static clone(scope?: Scope): Scope {
    const newScope = new OtelScope();
    if (scope) {
      newScope._breadcrumbs = [...scope['_breadcrumbs']];
      newScope._tags = { ...scope['_tags'] };
      newScope._extra = { ...scope['_extra'] };
      newScope._contexts = { ...scope['_contexts'] };
      newScope._user = scope['_user'];
      newScope._level = scope['_level'];
      newScope._span = scope['_span'];
      newScope._session = scope['_session'];
      newScope._transactionName = scope['_transactionName'];
      newScope._fingerprint = scope['_fingerprint'];
      newScope._eventProcessors = [...scope['_eventProcessors']];
      newScope._requestSession = scope['_requestSession'];
      newScope._attachments = [...scope['_attachments']];
      newScope._sdkProcessingMetadata = { ...scope['_sdkProcessingMetadata'] };
      newScope._propagationContext = { ...scope['_propagationContext'] };
    }
    return newScope;
  }

  /**
   * @inheritDoc
   */
  public addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): this {
    const transaction = getActiveTransaction();

    if (transaction) {
      transaction.addBreadcrumb(breadcrumb, maxBreadcrumbs);
      return this;
    }

    return super.addBreadcrumb(breadcrumb, maxBreadcrumbs);
  }

  /**
   * @inheritDoc
   */
  protected _getBreadcrumbs(): Breadcrumb[] {
    const transaction = getActiveTransaction();
    const transactionBreadcrumbs = transaction ? transaction.getBreadcrumbs() : [];

    return this._breadcrumbs.concat(transactionBreadcrumbs);
  }
}

/**
 * This gets the currently active transaction,
 * and ensures to wrap it so that we can store breadcrumbs on it.
 */
function getActiveTransaction(): TransactionWithBreadcrumbs | undefined {
  const activeSpan = getActiveSpan();
  const transaction = activeSpan && activeSpan.transaction;

  if (!transaction) {
    return undefined;
  }

  if (transactionHasBreadcrumbs(transaction)) {
    return transaction;
  }

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

function transactionHasBreadcrumbs(transaction: Transaction): transaction is TransactionWithBreadcrumbs {
  return (
    typeof (transaction as TransactionWithBreadcrumbs).getBreadcrumbs === 'function' &&
    typeof (transaction as TransactionWithBreadcrumbs).addBreadcrumb === 'function'
  );
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
