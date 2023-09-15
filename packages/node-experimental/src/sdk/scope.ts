import { Scope } from '@sentry/core';
import type { Breadcrumb } from '@sentry/types';

import type { TransactionWithBreadcrumbs } from '../types';
import { getActiveSpan } from './trace';

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

    if (transaction && transaction.addBreadcrumb) {
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
    const transactionBreadcrumbs = transaction && transaction.getBreadcrumbs ? transaction.getBreadcrumbs() : [];

    return this._breadcrumbs.concat(transactionBreadcrumbs);
  }
}

/**
 * This gets the currently active transaction,
 * and ensures to wrap it so that we can store breadcrumbs on it.
 */
function getActiveTransaction(): TransactionWithBreadcrumbs | undefined {
  const activeSpan = getActiveSpan();
  return activeSpan && (activeSpan.transaction as TransactionWithBreadcrumbs | undefined);
}
