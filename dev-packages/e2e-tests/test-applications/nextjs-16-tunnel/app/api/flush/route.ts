import * as Sentry from '@sentry/nextjs';

// Sends all buffered spans of the server, so a test can wait for them.
export async function GET(): Promise<Response> {
  await Sentry.flush();
  return new Response(null, { status: 204 });
}
