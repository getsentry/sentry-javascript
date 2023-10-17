import { type LinksFunction, type LoaderArgs } from '@shopify/remix-oxygen';
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  LiveReload,
  ScrollRestoration,
  useLoaderData,
  type ShouldRevalidateFunction,
  useRouteError,
} from '@remix-run/react';
import type { Shop } from '@shopify/hydrogen/storefront-api-types';
import appStyles from './styles/app.css';
import favicon from '../public/favicon.svg';
import { useNonce } from '@shopify/hydrogen';
import * as Sentry from '@sentry/remix';

// This is important to avoid re-fetching root queries on sub-navigations
export const shouldRevalidate: ShouldRevalidateFunction = ({ formMethod, currentUrl, nextUrl }) => {
  // revalidate when a mutation is performed e.g add to cart, login...
  if (formMethod && formMethod !== 'GET') {
    return true;
  }

  // revalidate when manually revalidating via useRevalidator
  if (currentUrl.toString() === nextUrl.toString()) {
    return true;
  }

  return false;
};

export const links: LinksFunction = () => {
  return [
    { rel: 'stylesheet', href: appStyles },
    {
      rel: 'preconnect',
      href: 'https://cdn.shopify.com',
    },
    {
      rel: 'preconnect',
      href: 'https://shop.app',
    },
    { rel: 'icon', type: 'image/svg+xml', href: favicon },
  ];
};

export async function loader({ context }: LoaderArgs) {
  const layout = await context.storefront.query<{ shop: Shop }>(LAYOUT_QUERY);
  return {
    layout,
  };
}

export function ErrorBoundary() {
  const error = useRouteError();
  const eventId = Sentry.captureRemixErrorBoundaryError(error);

  return (
    <div>
      <span>ErrorBoundary Error</span>
      <span id="event-id">{eventId}</span>
    </div>
  );
}

function App() {
  const nonce = useNonce();
  const data = useLoaderData<typeof loader>();

  const { name } = data.layout.shop;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <h1>Hello, {name}</h1>
        <p>This is a custom storefront powered by Hydrogen</p>
        <Outlet />
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
        <LiveReload nonce={nonce} />
      </body>
    </html>
  );
}

export default Sentry.withSentry(App);

const LAYOUT_QUERY = `#graphql
  query layout {
    shop {
      name
      description
    }
  }
`;
