import { Transaction, TransactionContext } from '@sentry/types';

export type Action = 'PUSH' | 'REPLACE' | 'POP';

export type Location = {
  pathname: string;
  action?: Action;
} & Record<string, any>;

export type ReactRouterInstrumentation = <T extends Transaction>(
  startTransaction: (context: TransactionContext) => T | undefined,
  startTransactionOnPageLoad?: boolean,
  startTransactionOnLocationChange?: boolean,
) => void;
