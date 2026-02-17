import { useEffect } from 'react';
import * as Sentry from '@sentry/remix';

export default function ManualTracing() {
  useEffect(() => {
    const span = Sentry.startInactiveSpan({
      name: 'test_transaction_1',
      forceTransaction: true,
    });
    span.end();
  }, []);

  return <div />;
}
