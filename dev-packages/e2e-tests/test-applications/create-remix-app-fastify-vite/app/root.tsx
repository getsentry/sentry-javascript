import { MetaFunction, json } from '@remix-run/node';
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
// eslint-disable-next-line import/no-unresolved
import '#app/styles/global.css';

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
      env: JSON.stringify(data.ENV),
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
  const { ENV } = useLoaderData<typeof loader>();

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
        <div>
          <p>ErrorBoundary Error</p>
          <p id="event-id">{eventId}</p>
        </div>
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}

function App() {
  const { ENV } = useLoaderData<typeof loader>();

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
