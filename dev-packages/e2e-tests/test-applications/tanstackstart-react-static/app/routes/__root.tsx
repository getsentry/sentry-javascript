import { useEffect, type ReactNode } from 'react';
import { Outlet, createRootRoute, HeadContent, Scripts } from '@tanstack/react-router';

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
        title: 'TanStack Start Starter',
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  // Mark the document as hydrated so tests can wait for React to attach event
  // handlers before clicking. `toBeVisible()` only confirms the SSR HTML is
  // rendered; on slow CI runs Playwright can click before hydration completes,
  // the onClick handler isn't yet attached, and tests asserting on the
  // resulting client-side error time out (see #20641, #20685, #20867).
  useEffect(() => {
    document.documentElement.setAttribute('data-hydrated', 'true');
  }, []);
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
