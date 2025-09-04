import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  type ShouldRevalidateFunction,
  isRouteErrorResponse,
  useLocation,
  useMatches,
  useRouteError,
} from '@remix-run/react';
import { LoaderFunctionArgs } from '@remix-run/server-runtime';
import * as Sentry from '@sentry/remix/cloudflare';
import { useNonce } from '@shopify/hydrogen';
import type { CustomerAccessToken } from '@shopify/hydrogen/storefront-api-types';
import type { HydrogenSession } from '@shopify/hydrogen';
import { defer } from '@shopify/remix-oxygen';
import { useEffect } from 'react';

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

export function links() {
  return [
    {
      rel: 'preconnect',
      href: 'https://cdn.shopify.com',
    },
    {
      rel: 'preconnect',
      href: 'https://shop.app',
    },
  ];
}

export async function loader({ context }: { context: LoaderFunctionArgs['context'] }) {
  const { storefront, session, cart } = context as {
    storefront: {
      query: (query: string, options: any) => Promise<any>;
      CacheLong: () => any;
    };
    session: HydrogenSession;
    cart: unknown;
    env: unknown;
  };
  // Type assertion for cart to fix TS error
  const typedCart = cart as { get: () => Promise<unknown> };
  const customerAccessToken = await (session as HydrogenSession).get('customerAccessToken');
  const publicStoreDomain = (context.env as { PUBLIC_STORE_DOMAIN: string }).PUBLIC_STORE_DOMAIN;

  // validate the customer access token is valid
  const { isLoggedIn, headers } = await validateCustomerAccessToken(session, customerAccessToken);

  // defer the cart query by not awaiting it
  const cartPromise = typedCart.get();

  // defer the footer query (below the fold)
  const footerPromise = storefront.query(FOOTER_QUERY, {
    cache: storefront.CacheLong(),
    variables: {
      footerMenuHandle: 'footer', // Adjust to your footer menu handle
    },
  });

  // await the header query (above the fold)
  const headerPromise = storefront.query(HEADER_QUERY, {
    cache: storefront.CacheLong(),
    variables: {
      headerMenuHandle: 'main-menu', // Adjust to your header menu handle
    },
  });

  return defer(
    {
      cart: cartPromise,
      footer: footerPromise,
      header: await headerPromise,
      isLoggedIn,
      publicStoreDomain,
    },
    { headers },
  );
}

export const meta = ({
  data,
}: {
  data: {
    ENV: { SENTRY_DSN: string };
    sentryTrace: string;
    sentryBaggage: string;
  };
}) => {
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

function App() {
  const nonce = useNonce();

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
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
        <LiveReload nonce={nonce} />
      </body>
    </html>
  );
}

// Need to supply the hooks to Sentry.withSentry for hydrogen apps
export default Sentry.withSentry(App, useEffect, useLocation, useMatches);

export function ErrorBoundary() {
  const error = useRouteError();
  const [root] = useMatches();
  const nonce = useNonce();
  let errorMessage = 'Unknown error';
  let errorStatus = 500;

  // Send the error to Sentry
  const eventId = Sentry.captureRemixErrorBoundaryError(error);

  if (isRouteErrorResponse(error)) {
    errorMessage = error?.data?.message ?? error.data;
    errorStatus = error.status;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <div className="route-error">
          <h1>Oops</h1>
          <h2>{errorStatus}</h2>
          {errorMessage && (
            <fieldset>
              <pre>{errorMessage}</pre>
            </fieldset>
          )}
          {eventId && (
            <h2>
              Sentry Event ID: <code>{eventId}</code>
            </h2>
          )}
        </div>
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
        <LiveReload nonce={nonce} />
      </body>
    </html>
  );
}

/**
 * Validates the customer access token and returns a boolean and headers
 * @see https://shopify.dev/docs/api/storefront/latest/objects/CustomerAccessToken
 *
 * @example
 * ```ts
 * //
 * const {isLoggedIn, headers} = await validateCustomerAccessToken(
 *  customerAccessToken,
 *  session,
 *  );
 *  ```
 *  */
async function validateCustomerAccessToken(session: HydrogenSession, customerAccessToken?: CustomerAccessToken) {
  let isLoggedIn = false;
  const headers = new Headers();
  if (!customerAccessToken?.accessToken || !customerAccessToken?.expiresAt) {
    return { isLoggedIn, headers };
  }

  const expiresAt = new Date(customerAccessToken.expiresAt).getTime();
  const dateNow = Date.now();
  const customerAccessTokenExpired = expiresAt < dateNow;

  if (customerAccessTokenExpired) {
    session.unset('customerAccessToken');
    headers.append('Set-Cookie', await session.commit());
  } else {
    isLoggedIn = true;
  }

  return { isLoggedIn, headers };
}

const MENU_FRAGMENT = `#graphql
  fragment MenuItem on MenuItem {
    id
    resourceId
    tags
    title
    type
    url
  }
  fragment ChildMenuItem on MenuItem {
    ...MenuItem
  }
  fragment ParentMenuItem on MenuItem {
    ...MenuItem
    items {
      ...ChildMenuItem
    }
  }
  fragment Menu on Menu {
    id
    items {
      ...ParentMenuItem
    }
  }
` as const;

const HEADER_QUERY = `#graphql
  fragment Shop on Shop {
    id
    name
    description
    primaryDomain {
      url
    }
    brand {
      logo {
        image {
          url
        }
      }
    }
  }
  query Header(
    $country: CountryCode
    $headerMenuHandle: String!
    $language: LanguageCode
  ) @inContext(language: $language, country: $country) {
    shop {
      ...Shop
    }
    menu(handle: $headerMenuHandle) {
      ...Menu
    }
  }
  ${MENU_FRAGMENT}
` as const;

const FOOTER_QUERY = `#graphql
  query Footer(
    $country: CountryCode
    $footerMenuHandle: String!
    $language: LanguageCode
  ) @inContext(language: $language, country: $country) {
    menu(handle: $footerMenuHandle) {
      ...Menu
    }
  }
  ${MENU_FRAGMENT}
` as const;
