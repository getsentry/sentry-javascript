'use client';

import { startInactiveSpan } from '@sentry/nextjs';
import { Span } from '@sentry/types';
import { PropsWithChildren, createContext, useState } from 'react';

export const SpanContext = createContext<
  { spanActive: false; start: (spanName: string) => void } | { spanActive: true; stop: () => void }
>({
  spanActive: false,
  start: () => undefined,
});

export function SpanContextProvider({ children }: PropsWithChildren) {
  const [span, setSpan] = useState<Span | undefined>(undefined);

  return (
    <SpanContext.Provider
      value={
        span
          ? {
              spanActive: true,
              stop: () => {
                span.end();
                setSpan(undefined);
              },
            }
          : {
              spanActive: false,
              start: (spanName: string) => {
                const span = startInactiveSpan({ name: spanName });
                setSpan(span);
              },
            }
      }
    >
      {children}
    </SpanContext.Provider>
  );
}
