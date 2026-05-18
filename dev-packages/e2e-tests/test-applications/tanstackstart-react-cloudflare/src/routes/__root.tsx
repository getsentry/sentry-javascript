import type { ReactNode } from 'react';
import { Outlet, createRootRoute, HeadContent, Scripts } from '@tanstack/react-router';
import { getTraceData } from '@sentry/tanstackstart-react';

export const Route = createRootRoute({
  head: () => {
    const traceData = getTraceData();
    const sentryMeta = Object.entries(traceData).map(([key, value]) => ({
      name: key,
      content: value,
    }));

    return {
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
        ...sentryMeta,
      ],
    };
  },
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html>
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
