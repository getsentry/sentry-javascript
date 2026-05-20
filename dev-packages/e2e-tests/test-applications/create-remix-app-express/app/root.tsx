import { cssBundleHref } from '@remix-run/css-bundle';
import { LinksFunction, LoaderFunction, MetaFunction, defer, json, redirect } from '@remix-run/node';
import { Links, LiveReload, Meta, Outlet, Scripts, ScrollRestoration, useRouteError } from '@remix-run/react';
import { captureRemixErrorBoundaryError, withSentry } from '@sentry/remix';
import type { SentryMetaArgs } from '@sentry/remix';

export const links: LinksFunction = () => [...(cssBundleHref ? [{ rel: 'stylesheet', href: cssBundleHref }] : [])];

const ENV = {
  SENTRY_DSN: process.env.E2E_TEST_DSN,
};

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const type = url.searchParams.get('type');

  switch (type) {
    case 'empty':
      return {};
    case 'plain':
      return { data_one: [], data_two: 'a string' };
    case 'json':
      return json({ data_one: [], data_two: 'a string' }, { headers: { 'Cache-Control': 'max-age=300' } });
    case 'defer':
      return defer({ data_one: [], data_two: 'a string' });
    case 'null':
      return null;
    case 'undefined':
      return undefined;
    case 'throwRedirect':
      throw redirect('/?type=plain');
    case 'returnRedirect':
      return redirect('/?type=plain');
    case 'throwRedirectToExternal':
      throw redirect('https://docs.sentry.io');
    case 'returnRedirectToExternal':
      return redirect('https://docs.sentry.io');
    default:
      return json({ ENV });
  }
};

export const meta = ({ data }: SentryMetaArgs<MetaFunction<typeof loader>>) => {
  return [
    {
      env: data?.ENV,
    },
    {
      name: 'sentry-trace',
      content: data?.sentryTrace,
    },
    {
      name: 'baggage',
      content: data?.sentryBaggage,
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
  // Use the module-level ENV constant so the client always gets a DSN even when
  // the root loader is exercised with `?type=...` variants that omit ENV.
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
