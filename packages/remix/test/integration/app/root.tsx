import { LoaderFunction, MetaFunction, defer, json, redirect } from '@remix-run/node';
import { Links, LiveReload, Meta, Outlet, Scripts, ScrollRestoration, useRouteError } from '@remix-run/react';
import { ErrorBoundaryComponent } from '@remix-run/react/dist/routeModules';
import { captureRemixErrorBoundaryError, withSentry } from '@sentry/remix';

export const ErrorBoundary: ErrorBoundaryComponent = () => {
  const error = useRouteError();

  captureRemixErrorBoundaryError(error);

  return (
    <div>
      <span id="error-header">ErrorBoundary Error</span>
    </div>
  );
};

export const meta: MetaFunction = ({ data }) => [
  { charset: 'utf-8' },
  { title: 'New Remix App' },
  { name: 'viewport', content: 'width=device-width,initial-scale=1' },
  { name: 'sentry-trace', content: data.sentryTrace },
  { name: 'baggage', content: data.sentryBaggage },
];

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const type = url.searchParams.get('type');

  switch (type) {
    case 'empty':
      return {};
    case 'plain':
      return {
        data_one: [],
        data_two: 'a string',
      };
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
      throw redirect(`https://docs.sentry.io`);
    case 'returnRedirectToExternal':
      return redirect('https://docs.sentry.io');
    default: {
      return {};
    }
  }
};

function App() {
  return (
    <html lang="en">
      <head>
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
