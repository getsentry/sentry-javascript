import { Link, useSearchParams } from '@remix-run/react';
import * as Sentry from '@sentry/remix';
import { MetaFunction } from '@remix-run/node';

// we will then demonstrate in out e2e tests that `sentry-trace` and `babbage`
// are inhereted and play nicely with route-level meta info
export const meta: MetaFunction = ({ matches }) => {
  const rootMatch = matches.find(({ id }) => id === 'root')?.meta || [];
  return [...rootMatch, { title: 'Remix + Fastify + Sentry' }];
};

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
