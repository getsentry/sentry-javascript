import type { ReactNode } from 'react';
import { Outlet, createRootRoute, HeadContent, Scripts, useRouterState } from '@tanstack/react-router';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'TanStack Start Cloudflare E2E Test',
      },
    ],
  }),
  component: RootComponent,
});

// Long enough that the SSR stream flushes a chunk boundary inside this attribute, ahead of
// the head. See https://github.com/getsentry/sentry-javascript/issues/23468.
const LONG_ATTRIBUTE = 'x'.repeat(3000);

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = useRouterState({ select: state => state.location.pathname });

  return (
    <html {...(pathname.startsWith('/split-head-chunk') ? { 'data-long': LONG_ATTRIBUTE } : {})}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
