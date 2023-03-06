'use client';

import { createContext, PropsWithChildren, useState } from 'react';
import { Transaction } from '@sentry/types';
import { startTransaction, getCurrentHub } from '@sentry/nextjs';

export const TransactionContext = createContext<{ transactionActive: boolean; toggle: () => void }>({
  transactionActive: false,
  toggle: () => undefined,
});

export function TransactionContextProvider({ children }: PropsWithChildren) {
  const [transaction, setTransaction] = useState<Transaction | undefined>(undefined);

  return (
    <TransactionContext.Provider
      value={{
        transactionActive: !!transaction,
        toggle: () => {
          if (transaction) {
            transaction.finish();
            setTransaction(undefined);
          } else {
            const t = startTransaction({ name: 'Manual Transaction' });
            getCurrentHub().getScope()?.setSpan(t);
            setTransaction(t);
          }
        },
      }}
    >
      {children}
    </TransactionContext.Provider>
  );
}
