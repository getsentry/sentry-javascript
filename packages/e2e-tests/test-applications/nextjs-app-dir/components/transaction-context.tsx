'use client';

import { createContext, PropsWithChildren, useState } from 'react';
import { Transaction } from '@sentry/types';
import { startTransaction } from '@sentry/nextjs';

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
            setTransaction(startTransaction({ name: 'Manual Transaction' }));
          }
        },
      }}
    >
      {children}
    </TransactionContext.Provider>
  );
}
