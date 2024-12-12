import { Link, useSearchParams } from '@remix-run/react';
import * as Sentry from '@sentry/remix';

export default function Index() {
  const [searchParams] = useSearchParams();

  if (searchParams.get('tag')) {
    Sentry.setTag('sentry_test', searchParams.get('tag'));
  }

  return (
    <div>
      <input
        type="button"
        value="Capture Exception"
        id="exception-button"
        onClick={() => {
          throw new Error('I am an error!');
        }}
      />
      <Link to="/user/5" id="navigation">
        navigate
      </Link>
    </div>
  );
}
