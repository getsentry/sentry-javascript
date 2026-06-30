import * as Sentry from '@sentry/react-router';

export async function loader() {
  await Sentry.flush(2000);
  return new Response(null, { status: 204 });
}
