import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/ssr-error')({
  loader: () => {
    throw new Error('Sentry SSR Test Error');
  },
  component: () => <div>SSR Error Page</div>,
});
