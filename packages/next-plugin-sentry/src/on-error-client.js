import { withScope, captureException, captureMessage } from '@sentry/nextjs';

export default async function onErrorClient({ err }) {
  withScope(scope => {
    if (err instanceof Error) {
      captureException(err);
    } else {
      captureMessage(err.message);
    }
  });
}
