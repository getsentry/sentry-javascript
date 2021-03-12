import { withScope, captureException, captureMessage } from '@sentry/nextjs';

export default async function onErrorClient({ err }) {
  withScope(scope => {
    if (err instanceof Error) {
      captureException(toCapture);
    } else {
      captureMessage(err.message);
    }
  });
}
