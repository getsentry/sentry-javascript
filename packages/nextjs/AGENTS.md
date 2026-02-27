# Next.js SDK (`@sentry/nextjs`)

## Bundler Architecture: Webpack vs Turbopack

Next.js apps use **either webpack or turbopack** as their bundler. This fundamentally changes how Sentry instruments the application.

- **Webpack** — default bundler through Next.js 15
- **Turbopack** — default bundler starting Next.js 16

Detection: `process.env.TURBOPACK` or `--turbo` CLI flag (see `src/config/util.ts:detectActiveBundler`).

### Webpack Path (Build-Time Wrapping)

Webpack builds use **loaders and templates** to wrap user code at compile time:

1. **Wrapping loader** (`src/config/loaders/wrappingLoader.ts`) identifies route handlers, API routes, pages, middleware, and server components by file path patterns
2. **Templates** (`src/config/templates/`) inject Sentry instrumentation around each export — using Rollup internally to expand `export *` statements
3. **Value injection loader** injects globals (`_sentryNextJsVersion`, route manifest, tunnel path, etc.)
4. **SentryWebpackPlugin** handles sourcemap upload and release management

Template files and what they wrap:
- `pageWrapperTemplate.ts` — Pages Router pages (`getInitialProps`, `getStaticProps`, `getServerSideProps`)
- `apiWrapperTemplate.ts` — Pages Router API routes
- `routeHandlerWrapperTemplate.ts` — App Router route handlers (GET, POST, etc.)
- `serverComponentWrapperTemplate.ts` — App Router server components, `generateMetadata`, `generateViewport`
- `middlewareWrapperTemplate.ts` — Edge middleware

Config options that control wrapping: `autoInstrumentServerFunctions`, `autoInstrumentMiddleware`, `autoInstrumentAppDirectory`, `excludeServerRoutes`.

### Turbopack Path (No Build-Time Wrapping)

Turbopack does **NOT** use the wrapping loader or templates. There is no build-time function wrapping.

What turbopack **does** support:
- **Value injection** via Turbopack rules (`src/config/turbopack/`) — injects the same globals as webpack
- **Module metadata injection** (`moduleMetadataInjectionLoader.ts`) — enables `thirdPartyErrorFilterIntegration` (requires Next.js 16+ and `_experimental.turbopackApplicationKey`)
- **Native debug IDs** for sourcemaps (Next.js 15.6+)
- **`runAfterProductionCompile` hook** (enabled by default) for sourcemap upload

What turbopack does **NOT** support:
- Build-time wrapping of route handlers, API routes, pages, server components, or middleware
- `autoInstrumentServerFunctions`, `autoInstrumentMiddleware`, `autoInstrumentAppDirectory` — these are no-ops
- `excludeServerRoutes` — no-op since routes aren't wrapped
- React component name annotations
- SentryWebpackPlugin (no webpack = no webpack plugin)

Instrumentation with turbopack relies on **Next.js's built-in telemetry/OpenTelemetry integration** and the `instrumentation.ts` hook rather than build-time code transformation.

## Config Flow

```
withSentryConfig(nextConfig, sentryOptions)
  → detect bundler (webpack or turbopack)
  → webpack:    constructWebpackConfigFunction() → loaders + plugins
  → turbopack:  constructTurbopackConfig()       → value injection rules only
  → set up runAfterProductionCompile hook (sourcemaps)
```

Entry point: `src/config/withSentryConfig/index.ts`
Routing logic: `src/config/withSentryConfig/getFinalConfigObject.ts`

## Key Directories

| Path | Purpose |
|------|---------|
| `src/config/webpack.ts` | Webpack-specific config (loaders, rules, plugins) |
| `src/config/turbopack/` | Turbopack-specific config (value injection rules) |
| `src/config/loaders/` | Webpack loaders (wrapping, value injection, module metadata) |
| `src/config/templates/` | Wrapper templates used by wrapping loader (webpack only) |
| `src/config/manifest/` | Route manifest generation for transaction grouping |
| `src/config/withSentryConfig/` | Main `withSentryConfig` entry point and bundler routing |
| `src/client/` | Client-side SDK (browser) |
| `src/server/` | Server-side SDK (Node.js) |
| `src/edge/` | Edge runtime SDK |
