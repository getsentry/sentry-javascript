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

## Status: `sentryTest.skip = true` (draft)

This app is **skipped in CI** because it cannot build on the current SvelteKit 3 prerelease yet.

The build fails in SvelteKit's own pipeline (reproduced with the Sentry plugin removed, so it is
**not** a Sentry issue):

```
[vite]: Rolldown failed to resolve import "$env/static/private" from "src/instrumentation.server.ts"
```

SvelteKit 3 ships on Vite 8 / Rolldown, and `$env/*` virtual-module resolution is broken in the
prerelease (both `$env/static/*` and `$env/dynamic/*`). Until that is fixed upstream, no SvelteKit
3 app whose hooks read `$env/*` can build.

**When upstream ships a buildable prerelease:** remove `sentryTest.skip` (use `optional` while it
remains a prerelease, then promote to a full matrix entry at GA) and confirm the suites pass.

## SvelteKit 3 differences captured here vs `sveltekit-2`

- **No `svelte.config.js`** — SvelteKit 3 removed it. Configuration (adapter, preprocess) is passed
  directly to the `sveltekit({ ... })` Vite plugin in `vite.config.js`. This is the main thing the
  Sentry SDK still needs to adapt to: the Vite-plugin glue currently reads `svelte.config.js`.
- Uses `@sveltejs/adapter-node` (exercises the SDK's Node-adapter output-dir detection).
