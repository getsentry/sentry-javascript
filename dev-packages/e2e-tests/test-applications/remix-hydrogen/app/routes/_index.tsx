import { Link, useSearchParams } from '@remix-run/react';
import * as Sentry from '@sentry/remix/cloudflare';

declare global {
  interface Window {
    capturedExceptionId?: string;
  }
}

export default function Index() {
  const [searchParams] = useSearchParams();

  if (searchParams.get('tag')) {
    Sentry.setTags({
      sentry_test: searchParams.get('tag'),
    });
  }

  return (
    <div>
      <input
        type="button"
        value="Capture Exception"
        id="exception-button"
        onClick={() => {
          const eventId = Sentry.captureException(new Error('I am an error!'));
          window.capturedExceptionId = eventId;
        }}
      />
      <Link to="/user/5" id="navigation">
        navigate
      </Link>
    </div>
  );
}
