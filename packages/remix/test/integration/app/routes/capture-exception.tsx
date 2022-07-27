import * as Sentry from '@sentry/remix';

export default function ErrorBoundaryCapture() {
  Sentry.captureException(new Error('Sentry Manually Captured Error'));

  return <div></div>;
}
