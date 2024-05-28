import * as Sentry from '@sentry/nextjs';
import { use } from 'react';

export function ClientComponentTakingAPromise({ promise }: { promise: Promise<string> }) {
  let value;
  try {
    value = use(promise);
  } catch (e) {
    Sentry.captureException(e); // This error should not be reported
    throw e;
  }
  return <p>Promise value: {value}</p>;
}
