import * as Sentry from '@sentry/tanstackstart-react';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/isolation')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const tag = new URL(request.url).searchParams.get('tag');
        Sentry.setTag('isolation-tag', tag);

        // Keeps concurrent requests in the handler at the same time, so a tag that leaks to another request ends up
        // on the wrong error.
        await new Promise(resolve => setTimeout(resolve, 100));

        Sentry.captureException(new Error(`Isolation error ${tag}`));
        return Response.json({ tag });
      },
    },
  },
});
