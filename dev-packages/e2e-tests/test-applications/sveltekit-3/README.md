# sveltekit-3 e2e test application

E2E test app for `@sentry/sveltekit` against **SvelteKit 3.x** (currently a prerelease — deps
float the `next` dist-tag: `@sveltejs/kit@next`, `@sveltejs/adapter-node@next`,
`@sveltejs/adapter-auto@next`). Built on Svelte 5, Vite 8, vite-plugin-svelte 7, TypeScript 6,
Node 22 — the minimums SvelteKit 3 requires.

This app enables SvelteKit's **native server-side OpenTelemetry tracing**
(`experimental.tracing.server` + `experimental.instrumentation.server`), so the Sentry SDK
picks up Kit's spans instead of starting its own `http.server` span. `Sentry.init` therefore
lives in `src/instrumentation.server.ts`, and the `tests/tracing.*` suites assert the native span
tree (`sveltekit.handle.root`, `function.sveltekit.resolve`, form-action spans, etc.).

## Status: `sentryTest.optional = true` (prerelease)

Runs in CI but failures don't block merges, since it tracks a moving `next` prerelease.

## SvelteKit 3 differences captured here vs `sveltekit-2`

- **Explicit environment variables.** SvelteKit 3 makes explicit env the default and removes the
  legacy `$env/*` virtual modules. This app declares its vars in `src/env.ts` (`defineEnvVars`) and
  imports them from `$app/env/private` / `$app/env/public`. This is also required in practice: the
  legacy `$env/*` modules currently **fail to build** under Kit 3's Vite 8 / Rolldown pipeline
  (`Rolldown failed to resolve import "$env/static/private"`) — an upstream bug scoped to the
  deprecated API. A standalone repro lives at `repros/sveltekit-3-env-rolldown`.
- **No `svelte.config.js`** — SvelteKit 3 removed it. Configuration (adapter, preprocess, the
  experimental tracing flags) is passed directly to the `sveltekit({ ... })` Vite plugin in
  `vite.config.js`. The Sentry SDK's Vite-plugin glue still reads `svelte.config.js` and will be
  adapted separately.
- Uses `@sveltejs/adapter-node` (exercises the SDK's Node-adapter output-dir detection).
- The DSN is declared `{ static: true }` in `src/env.ts` (inlined at build). A dynamic private var
  currently resolves to `undefined` at runtime under Kit 3's adapter-node even when set in
  `process.env`, so the server SDK would never receive it.

## Known-failing tests (skipped, pending SDK fix)

The native-tracing happy path works (init, span pickup, distributed traces all pass). The following
server-side tests are `test.skip`/`describe.skip` with inline `FIXME(sveltekit-3)` notes:

- `errors.server.test.ts` — error capture works, but stack-frame function names are `load$1` (not
  `load`) and the request URL scheme is `https`. Caused by the SDK still injecting manual load
  instrumentation because it detects native tracing via the now-removed `svelte.config.js`.
- `tracing.server.test.ts` › nested sub-request span — a duplicate server-load span
  (`function.sveltekit.server.load` on top of Kit's native `sveltekit.load`), same root cause.
- `tracing.server.test.ts` › form action span — `POST /form-action` server transaction never
  arrives under Kit 3 (no POST root span created server-side); needs further isolation.

Unskip these as the SDK is adapted for Kit 3 (detect native tracing from the Vite plugin options
instead of `svelte.config.js`, and guard the load wrappers on `event.tracing?.enabled`).
