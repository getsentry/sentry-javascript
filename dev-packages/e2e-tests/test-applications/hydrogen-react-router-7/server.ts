import * as serverBuild from 'virtual:react-router/server-build';
import { createRequestHandler, storefrontRedirect } from '@shopify/hydrogen';
import { createHydrogenRouterContext } from '~/lib/context';
import { wrapRequestHandler } from '@sentry/cloudflare';

/**
 * Export a fetch handler in module format.
 */
export default {
  async fetch(request: Request, env: Env, executionContext: ExecutionContext): Promise<Response> {
    return wrapRequestHandler(
      {
        options: {
          environment: 'qa', // dynamic sampling bias to keep transactions
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          tracesSampleRate: 1.0,
          tunnel: `http://localhost:3031/`, // proxy server
        },
        // Need to cast to any because this is not on cloudflare
        request: request as any,
        context: executionContext,
      },
      async () => {
        try {
          const hydrogenContext = await createHydrogenRouterContext(request, env, executionContext);

          /**
           * Create a Hydrogen request handler that internally
           * delegates to React Router for routing and rendering.
           */
          const handleRequest = createRequestHandler({
            build: serverBuild,
            mode: process.env.NODE_ENV,
            getLoadContext: () => hydrogenContext,
          });

          const response = await handleRequest(request);

          if (hydrogenContext.session.isPending) {
            response.headers.set('Set-Cookie', await hydrogenContext.session.commit());
          }

          if (response.status === 404) {
            /**
             * Check for redirects only when there's a 404 from the app.
             * If the redirect doesn't exist, then `storefrontRedirect`
             * will pass through the 404 response.
             */
            return storefrontRedirect({
              request,
              response,
              storefront: hydrogenContext.storefront,
            });
          }

          return response;
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(error);
          return new Response('An unexpected error occurred', { status: 500 });
        }
      },
    );
  },
};
