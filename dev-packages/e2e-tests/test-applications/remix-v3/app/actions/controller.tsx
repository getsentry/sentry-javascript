import { createController } from 'remix/router';
import type { Handle } from 'remix/ui';

import { assets, entryHref, entryPreloads } from '../assets.ts';
import { routes } from '../routes.ts';

function HomePage(handle: Handle<Record<string, never>>) {
  return () => (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Sentry Remix 3</title>
        {entryPreloads.map(href => (
          <link key={href} rel="modulepreload" href={href} />
        ))}
        <script type="module" src={entryHref}></script>
      </head>
      <body>
        <h1 id="home">Sentry Remix 3</h1>
        <button id="throw-error" type="button">
          Throw error
        </button>
      </body>
    </html>
  );
}

export default createController(routes, {
  actions: {
    async assets(context) {
      return (await assets.fetch(context.request)) ?? new Response('Not Found', { status: 404 });
    },
    home(context) {
      return context.render(<HomePage />);
    },
  },
});
