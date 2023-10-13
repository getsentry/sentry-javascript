import { json, LinksFunction } from '@remix-run/cloudflare';
import { cssBundleHref } from '@remix-run/css-bundle';
import { Links, LiveReload, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from '@remix-run/react';
import { withSentry } from '@sentry/remix';
import { env } from '../env';

export const links: LinksFunction = () => [...(cssBundleHref ? [{ rel: 'stylesheet', href: cssBundleHref }] : [])];

export const loader = () => {
  return json({
    ENV: {
      SENTRY_DSN: env.SENTRY_DSN,
    },
  });
};

function App() {
  const { ENV } = useLoaderData();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
