import { cssBundleHref } from '@remix-run/css-bundle';
import { LinksFunction, MetaFunction, json } from '@remix-run/node';
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteError,
} from '@remix-run/react';
import { captureRemixErrorBoundaryError, withSentry } from '@sentry/remix';
import type { SentryMetaArgs } from '@sentry/remix';

export const links: LinksFunction = () => [...(cssBundleHref ? [{ rel: 'stylesheet', href: cssBundleHref }] : [])];

export const loader = () => {
  return json({
    ENV: {
      SENTRY_DSN: process.env.E2E_TEST_DSN,
    },
  });
};

export const meta = ({ data }: SentryMetaArgs<MetaFunction<typeof loader>>) => {
  return [
    {
      env: data.ENV,
    },
    {
      name: 'sentry-trace',
      content: data.sentryTrace,
    },
    {
      name: 'baggage',
      content: data.sentryBaggage,
    },
  ];
};

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
  const { ENV } = useLoaderData();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.ENV = ${JSON.stringify(ENV)}`,
          }}
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}

export default withSentry(App);
