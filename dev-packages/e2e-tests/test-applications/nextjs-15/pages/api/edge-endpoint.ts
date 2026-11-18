import * as Sentry from '@sentry/nextjs';

export const config = {
  runtime: 'edge',
};

export default async function handler() {
  Sentry.setTag('my-isolated-tag', true);

  return new Response(
    JSON.stringify({
      name: 'Jim Halpert',
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    },
  );
}
