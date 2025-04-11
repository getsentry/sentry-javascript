import * as Sentry from '@sentry/remix';

export default function ErrorBoundaryCapture() {
  Sentry.captureMessage('Sentry Manually Captured Message');

  return <div />;
}
