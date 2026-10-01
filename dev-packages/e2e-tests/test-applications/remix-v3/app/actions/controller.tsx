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
        {/* No `data-rmx-document`, so the runtime intercepts this through the Navigation API. */}
        <a id="to-user" href="/users/12345">
          User
        </a>
        <button type="button" id="component-error">
          Component error
        </button>
        <button id="throw-error" type="button">
          Throw error
        </button>
      </body>
    </html>
  );
}

function UserPage(handle: Handle<{ id?: string }>) {
  return () => (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>User</title>
      </head>
      <body>
        <h1 id="user">User {handle.props.id}</h1>
      </body>
    </html>
  );
}

let slowStarted = false;

export default createController(routes, {
  actions: {
    async assets(context) {
      return (await assets.fetch(context.request)) ?? new Response('Not Found', { status: 404 });
    },
    home(context) {
      return context.render(<HomePage />);
    },
    user(context) {
      return context.render(<UserPage id={context.params.id} />);
    },
    teapot() {
      return new Response("I'm a teapot", { status: 418 });
    },
    boom() {
      throw new Error('Route handler failed');
    },
    // Long enough for a test to disconnect mid request. `/slow-started` tells the test when the handler
    // is running, so the disconnect lands inside it rather than before it.
    async slow() {
      slowStarted = true;
      await new Promise(resolve => setTimeout(resolve, 3000));
      return new Response('slow');
    },
    slowStarted() {
      return new Response(slowStarted ? '1' : '0');
    },
  },
});
