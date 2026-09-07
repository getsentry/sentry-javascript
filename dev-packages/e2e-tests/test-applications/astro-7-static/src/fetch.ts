import type { Fetchable } from 'astro';
import { astro, FetchState } from 'astro/fetch';

// Astro 7 "advanced routing": `src/fetch.ts` lets the app own the request
// pipeline. We use it to verify that Sentry instrumentation still works when
// the user composes the pipeline themselves instead of relying on Astro's
// built-in handler.
//
// - `/fetch-custom` is handled entirely here, bypassing Astro's pipeline.
//   The OTel HTTP instrumentation still creates an `http.server` span, but
//   Sentry's auto-injected Astro middleware does NOT run (no route enhancement).
// - Every other request flows through Astro's full pipeline via `astro(state)`,
//   which still runs Sentry's auto-injected middleware (route parametrization,
//   trace meta tag injection, error capture, etc.).
export default {
  async fetch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === '/fetch-custom') {
      return new Response('handled-by-fetch-entrypoint', {
        headers: {
          'content-type': 'text/plain',
          'x-astro-advanced-routing': 'custom',
        },
      });
    }

    const state = new FetchState(request);
    const response = await astro(state);

    // Tag the response so the e2e test can prove the custom pipeline ran.
    try {
      response.headers.set('x-astro-advanced-routing', 'pipeline');
    } catch {
      // Some responses may have immutable headers; ignore in that case.
    }
    return response;
  },
} satisfies Fetchable;
