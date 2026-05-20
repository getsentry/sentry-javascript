import * as Sentry from '@sentry/remix';

export default function CaptureException() {
  Sentry.captureException(new Error('Sentry Manually Captured Error'));

  return <div />;
}
