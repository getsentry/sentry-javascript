# browser-bfcache

Exercises `bfcacheMetricsIntegration` against a **real** browser back/forward cache, covering hits,
misses, and the real `notRestoredReasons` the browser reports (Chromium-only, and this app is
Chromium). Deliberately bfcache-ineligible pages are produced via `?botch=<case>` (see `src/main.ts`).

Why this needs its own app rather than living in `browser-integration-tests`:

- **Real documents, real server.** bfcache only kicks in on a genuine cross-document history
  traversal served over real HTTP. The shared browser suite serves pages via CDP `page.route`
  interception on a fake host, which bfcache treats as ineligible. Here two static pages
  (`index.html`, `page-2.html`) are built with Vite and served with `vite preview`. It must be the
  production build, not `vite dev` (the dev server's HMR websocket is itself a bfcache blocker).
- **A specific Chromium launch recipe** (see `playwright.config.mjs`): the full Chrome-for-Testing
  binary (`channel: 'chromium'`, not the default `chromium_headless_shell`, which has no bfcache),
  with Playwright's `--disable-back-forward-cache` flag stripped and `BackForwardCache` enabled.
- **Renderer-initiated navigation.** Restores are triggered with `history.back()` from the page;
  Playwright's CDP `goBack` bypasses bfcache.

Blocker cases are version-sensitive (the pinned Chromium comes from the Playwright version):
`unload` is a stable blocker; `Cache-Control: no-store` no longer blocks (CCNS bfcache landed); an
open WebSocket blocks only before Chrome 149, so that assertion is gated on the browser version.

If other tests later fit these same constraints, this app can be renamed to something broader.
