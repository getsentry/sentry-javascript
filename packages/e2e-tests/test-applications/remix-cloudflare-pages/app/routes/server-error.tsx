import { json } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import * as Sentry from '@sentry/remix';

export function loader() {
  const id = Sentry.captureException(new Error('Sentry Server Error'));

  return json({ id });
}

export default function ServerError() {
  const { id } = useLoaderData();

  return (
    <div>
      <pre id="event-id">{id}</pre>
    </div>
  );
}
