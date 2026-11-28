import * as Sentry from '@sentry/tanstackstart-react';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/isolation-ssr')({
  loader: () => {
    Sentry.setTag('ssr-tag', 'from-ssr');
  },
  component: () => <div>Isolation SSR</div>,
});
