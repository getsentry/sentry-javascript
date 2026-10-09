# solid-2

A Solid 2 app on `@solidjs/vite-plugin`'s start mode, built with `observe: true`, with `@sentry/solid-2` on both halves:

- the server SDK through `start.instrument` (`src/instrument.ts`), which the plugin awaits before the server graph loads;
- the browser SDK from `src/sentry.client.ts`, imported by the app behind an `isServer` guard;
- `server.mjs`, a bare `node:http` host around the built `handleRequest`.

`@solidjs/router`'s `createRouter` declares the routes to the runtime's observe tier; the SDK has no router code. `/`
calls a server function on click and offers `/users/6` as an anchor and as a `navigate()` button, `/users/:id`
awaits one under a `<Loading>`, `/server-error` throws during SSR inside an `<Errored>`, `/client-error` throws in
the browser inside one.

What the tests pin, against the packed tarballs:

- errors: both hooks fire once, with the component that threw and the boundary that met it; the wire carries the
  sanitized message while Sentry gets the real one; a server-function throw arrives with the function id;
- performance (server): a waiting `<Loading>` and the server function it awaited are spans under OTel's `http.server`
  span, backdated from the runtime's clock; the request is named `GET /users/:id` by the route the runtime rendered;
- performance (client): the `pageload` continues the server trace with no middleware (the runtime's `<meta>` pair and
  `Server-Timing`) and is named `/users/:id` by the route it arrived on; a navigation is the browser's `navigation`
  span named by the route, ended where the transition committed, with the route's server-function call as its child;
  the `navigate()` click links to it, the anchor click records no interaction; a click is a root span and the
  server-function call it made is its child, joined by identity even though the call landed after the interaction
  settled.

```bash
pnpm install
pnpm build
pnpm test:prod
```
