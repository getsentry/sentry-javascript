import { TransactionContext } from '@sentry/types';

import * as Sentry from '../index.client';
import { wrapRouter } from './routerWrapper';

export function startClientPerfMonitoring(): void {
  wrapRouter();
  startInitialTransaction();
}

function startInitialTransaction(): void {
  const initialTransactionCtx = getInitialTransactionContext();
  const transaction = Sentry.startTransaction(initialTransactionCtx);
  Sentry.getCurrentHub()
    .getScope()
    ?.setSpan(transaction);
}

function getInitialTransactionContext(): TransactionContext {
  return {
    name: `GET ${window.location.pathname}`,
    // Operation target format is `<protocol>.client`.
    // `window.location.protocol` is `<protocol>:`, so remove the `:`.
    op: `${window.location.protocol.slice(0, -1)}.client`,
    sampled: true, // For testing purposes, remove for production
  };
}
