import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';

const ClientError = (): JSX.Element => (
  <>
    <input
      type="button"
      value="Capture Exception"
      id="exception-button"
      onClick={() => {
        const eventId = Sentry.captureException(new Error('I am an error!'));
        window.capturedExceptionId = eventId;
      }}
    />
    <Link href="/user/5" id="navigation">
      navigate
    </Link>
  </>
);

export default ClientError;
