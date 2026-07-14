import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteError } from '@remix-run/react';
import { captureRemixErrorBoundaryError, withSentry } from '@sentry/remix';

export function ErrorBoundary() {
  const error = useRouteError();
  const eventId = captureRemixErrorBoundaryError(error);

  return (
    <div>
      <span>ErrorBoundary Error</span>
      <span id="event-id">{eventId}</span>
    </div>
  );
}

function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default withSentry(App);
