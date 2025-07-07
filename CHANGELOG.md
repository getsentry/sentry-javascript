# Changelog

## Unreleased

- "You miss 100 percent of the chances you don't take. — Wayne Gretzky" — Michael Scott

## 9.35.0

- feat(browser): Add ElementTiming instrumentation and spans ([#16589](https://github.com/getsentry/sentry-javascript/pull/16589))
- feat(browser): Export `Context` and `Contexts` types ([#16763](https://github.com/getsentry/sentry-javascript/pull/16763))
- feat(cloudflare): Add user agent to cloudflare spans ([#16793](https://github.com/getsentry/sentry-javascript/pull/16793))
- feat(node): Add `eventLoopBlockIntegration` ([#16709](https://github.com/getsentry/sentry-javascript/pull/16709))
- feat(node): Export server-side feature flag integration shims ([#16735](https://github.com/getsentry/sentry-javascript/pull/16735))
- feat(node): Update vercel ai integration attributes ([#16721](https://github.com/getsentry/sentry-javascript/pull/16721))
- fix(astro): Handle errors in middlewares better ([#16693](https://github.com/getsentry/sentry-javascript/pull/16693))
- fix(browser): Ensure explicit `parentSpan` is considered ([#16776](https://github.com/getsentry/sentry-javascript/pull/16776))
- fix(node): Avoid using dynamic `require` for fastify integration ([#16789](https://github.com/getsentry/sentry-javascript/pull/16789))
- fix(nuxt): Add `@sentry/cloudflare` as optional peerDependency ([#16782](https://github.com/getsentry/sentry-javascript/pull/16782))
- fix(nuxt): Ensure order of plugins is consistent ([#16798](https://github.com/getsentry/sentry-javascript/pull/16798))
- fix(nestjs): Fix exception handling in `@Cron` decorated tasks ([#16792](https://github.com/getsentry/sentry-javascript/pull/16792))

Work in this release was contributed by @0xbad0c0d3 and @alSergey. Thank you for your contributions!

## 9.34.0

### Important Changes

- **feat(nuxt): Add Cloudflare Nitro plugin ([#15597](https://github.com/getsentry/sentry-javascript/pull/15597))**

  A Nitro plugin for `@sentry/nuxt` which initializes Sentry when deployed to Cloudflare (`cloudflare-pages` preset).

  1. Remove the previous server config file: `sentry.server.config.ts`
  2. Add a plugin in `server/plugins` (e.g. `server/plugins/sentry-cloudflare-setup.ts`)
  3. Add this code in your plugin file

     ```javascript
     // server/plugins/sentry-cloudflare-setup.ts (filename does not matter)
     import { sentryCloudflareNitroPlugin } from '@sentry/nuxt/module/plugins';

     export default defineNitroPlugin(
       sentryCloudflareNitroPlugin({
         dsn: 'https://dsn',
         tracesSampleRate: 1.0,
       }),
     );
     ```

     or with access to `nitroApp`:

     ```javascript
     // server/plugins/sentry-cloudflare-setup.ts (filename does not matter)
     import { sentryCloudflareNitroPlugin } from '@sentry/nuxt/module/plugins';

     export default defineNitroPlugin(sentryCloudflareNitroPlugin((nitroApp: NitroApp) => {
       // You can access nitroApp here if needed
       return  ({
         dsn: 'https://dsn',
         tracesSampleRate: 1.0,
       })
     }))
     ```

### Other Changes

- feat(browser): Record standalone LCP spans ([#16591](https://github.com/getsentry/sentry-javascript/pull/16591))
- fix(nuxt): Only add OTel alias in dev mode ([#16756](https://github.com/getsentry/sentry-javascript/pull/16756))

## 9.33.0

### Important Changes

- **feat: Add opt-in `vercelAiIntegration` to cloudflare & vercel-edge ([#16732](https://github.com/getsentry/sentry-javascript/pull/16732))**

The `vercelAiIntegration` is now available as opt-in for the Cloudflare and the Next.js SDK for Vercel Edge.
To use it, add the integration in `Sentry.init`

```js
Sentry.init({
  tracesSampleRate: 1.0,
  integrations: [Sentry.vercelAIIntegration()],
});
```

And enable telemetry for Vercel AI calls

```js
const result = await generateText({
  model: openai('gpt-4o'),
  experimental_telemetry: {
    isEnabled: true,
  },
});
```

- **feat(node): Add postgresjs instrumentation ([#16665](https://github.com/getsentry/sentry-javascript/pull/16665))**

The Node.js SDK now includes instrumentation for [Postgres.js](https://www.npmjs.com/package/postgres).

- **feat(node): Use diagnostics channel for Fastify v5 error handling ([#16715](https://github.com/getsentry/sentry-javascript/pull/16715))**

If you're on Fastify v5, you no longer need to call `setupFastifyErrorHandler`. It is done automatically by the node SDK. Older versions still rely on calling `setupFastifyErrorHandler`.

### Other Changes

- feat(cloudflare): Allow interop with OpenTelemetry emitted spans ([#16714](https://github.com/getsentry/sentry-javascript/pull/16714))
- feat(cloudflare): Flush after `waitUntil` ([#16681](https://github.com/getsentry/sentry-javascript/pull/16681))
- fix(nextjs): Remove `ai` from default server external packages ([#16736](https://github.com/getsentry/sentry-javascript/pull/16736))

Work in this release was contributed by @0xbad0c0d3. Thank you for your contribution!

## 9.32.0

### Important Changes

- feat(browser): Add CLS sources to span attributes ([#16710](https://github.com/getsentry/sentry-javascript/pull/16710))

Enhances CLS (Cumulative Layout Shift) spans by adding attributes detailing the elements that caused layout shifts.

- feat(cloudflare): Add `instrumentWorkflowWithSentry` to instrument workflows ([#16672](https://github.com/getsentry/sentry-javascript/pull/16672))

We've added support for Cloudflare Workflows, enabling comprehensive tracing for your workflow runs. This integration uses the workflow's instanceId as the Sentry trace_id and for sampling, linking all steps together. You'll now be able to see full traces, including retries with exponential backoff.

- feat(pino-transport): Add functionality to send logs to sentry ([#16667](https://github.com/getsentry/sentry-javascript/pull/16667))

Adds the ability to send logs to Sentry via a pino transport.

### Other Changes

- feat(nextjs): Expose top level buildTime `errorHandler` option ([#16718](https://github.com/getsentry/sentry-javascript/pull/16718))
- feat(node): update pipeline spans to use agent naming ([#16712](https://github.com/getsentry/sentry-javascript/pull/16712))
- feat(deps): bump @prisma/instrumentation from 6.9.0 to 6.10.1 ([#16698](https://github.com/getsentry/sentry-javascript/pull/16698))
- fix(sveltekit): Export logger from sveltekit worker ([#16716](https://github.com/getsentry/sentry-javascript/pull/16716))
- fix(google-cloud-serverless): Make `CloudEventsContext` compatible with `CloudEvent` ([#16705](https://github.com/getsentry/sentry-javascript/pull/16705))
- fix(nextjs): Stop injecting release value when create release options is set to `false` ([#16695](https://github.com/getsentry/sentry-javascript/pull/16695))
- fix(node): account for Object. syntax with local variables matching ([#16702](https://github.com/getsentry/sentry-javascript/pull/16702))
- fix(nuxt): Add alias for `@opentelemetry/resources` ([#16727](https://github.com/getsentry/sentry-javascript/pull/16727))

Work in this release was contributed by @flaeppe. Thank you for your contribution!

## 9.31.0

### Important Changes

- feat(nextjs): Add option for auto-generated random tunnel route ([#16626](https://github.com/getsentry/sentry-javascript/pull/16626))

Adds an option to automatically generate a random tunnel route for the Next.js SDK. This helps prevent ad blockers and other tools from blocking Sentry requests by using a randomized path instead of the predictable `/monitoring` endpoint.

- feat(core): Allow to pass `scope` & `client` to `getTraceData` ([#16633](https://github.com/getsentry/sentry-javascript/pull/16633))

Adds the ability to pass custom `scope` and `client` parameters to the `getTraceData` function, providing more flexibility when generating trace data for distributed tracing.

### Other Changes

- feat(core): Add support for `x-forwarded-host` and `x-forwarded-proto` headers ([#16687](https://github.com/getsentry/sentry-javascript/pull/16687))
- deps: Remove unused `@sentry/opentelemetry` dependency ([#16677](https://github.com/getsentry/sentry-javascript/pull/16677))
- deps: Update all bundler plugin instances to latest & allow caret ranges ([#16641](https://github.com/getsentry/sentry-javascript/pull/16641))
- feat(deps): Bump @prisma/instrumentation from 6.8.2 to 6.9.0 ([#16608](https://github.com/getsentry/sentry-javascript/pull/16608))
- feat(flags): add node support for generic featureFlagsIntegration and move utils to core ([#16585](https://github.com/getsentry/sentry-javascript/pull/16585))
- feat(flags): capture feature flag evaluations on spans ([#16485](https://github.com/getsentry/sentry-javascript/pull/16485))
- feat(pino): Add initial package for `@sentry/pino-transport` ([#16652](https://github.com/getsentry/sentry-javascript/pull/16652))
- fix: Wait for the correct clientWidth/clientHeight when showing Feedback Screenshot previews ([#16648](https://github.com/getsentry/sentry-javascript/pull/16648))
- fix(browser): Remove usage of Array.at() method ([#16647](https://github.com/getsentry/sentry-javascript/pull/16647))
- fix(core): Improve `safeJoin` usage in console logging integration ([#16658](https://github.com/getsentry/sentry-javascript/pull/16658))
- fix(google-cloud-serverless): Make `CloudEvent` type compatible ([#16661](https://github.com/getsentry/sentry-javascript/pull/16661))
- fix(nextjs): Fix lookup of `instrumentation-client.js` file ([#16637](https://github.com/getsentry/sentry-javascript/pull/16637))
- fix(node): Ensure graphql errors result in errored spans ([#16678](https://github.com/getsentry/sentry-javascript/pull/16678))

## 9.30.0

- feat(nextjs): Add URL to tags of server components and generation functions issues ([#16500](https://github.com/getsentry/sentry-javascript/pull/16500))
- feat(nextjs): Ensure all packages we auto-instrument are externalized ([#16552](https://github.com/getsentry/sentry-javascript/pull/16552))
- feat(node): Automatically enable `vercelAiIntegration` when `ai` module is detected ([#16565](https://github.com/getsentry/sentry-javascript/pull/16565))
- feat(node): Ensure `modulesIntegration` works in more environments ([#16566](https://github.com/getsentry/sentry-javascript/pull/16566))
- feat(core): Don't gate user on logs with `sendDefaultPii` ([#16527](https://github.com/getsentry/sentry-javascript/pull/16527))
- feat(browser): Add detail to measure spans and add regression tests ([#16557](https://github.com/getsentry/sentry-javascript/pull/16557))
- feat(node): Update Vercel AI span attributes ([#16580](https://github.com/getsentry/sentry-javascript/pull/16580))
- fix(opentelemetry): Ensure only orphaned spans of sent spans are sent ([#16590](https://github.com/getsentry/sentry-javascript/pull/16590))

## 9.29.0

### Important Changes

- **feat(browser): Update `web-vitals` to 5.0.2 ([#16492](https://github.com/getsentry/sentry-javascript/pull/16492))**

This release upgrades the `web-vitals` library to version 5.0.2. This upgrade could slightly change the collected web vital values and potentially also influence alerts and performance scores in the Sentry UI.

### Other Changes

- feat(deps): Bump @sentry/rollup-plugin from 3.4.0 to 3.5.0 ([#16524](https://github.com/getsentry/sentry-javascript/pull/16524))
- feat(ember): Stop warning for `onError` usage ([#16547](https://github.com/getsentry/sentry-javascript/pull/16547))
- feat(node): Allow to force activate `vercelAiIntegration` ([#16551](https://github.com/getsentry/sentry-javascript/pull/16551))
- feat(node): Introduce `ignoreLayersType` option to koa integration ([#16553](https://github.com/getsentry/sentry-javascript/pull/16553))
- fix(browser): Ensure `suppressTracing` does not leak when async ([#16545](https://github.com/getsentry/sentry-javascript/pull/16545))
- fix(vue): Ensure root component render span always ends ([#16488](https://github.com/getsentry/sentry-javascript/pull/16488))

## 9.28.1

- feat(deps): Bump @sentry/cli from 2.45.0 to 2.46.0 ([#16516](https://github.com/getsentry/sentry-javascript/pull/16516))
- fix(nextjs): Avoid tracing calls to symbolication server on dev ([#16533](https://github.com/getsentry/sentry-javascript/pull/16533))
- fix(sveltekit): Add import attribute for node exports ([#16528](https://github.com/getsentry/sentry-javascript/pull/16528))

Work in this release was contributed by @eltigerchino. Thank you for your contribution!

## 9.28.0

### Important Changes

- **feat(nestjs): Stop creating spans for `TracingInterceptor` ([#16501](https://github.com/getsentry/sentry-javascript/pull/16501))**

With this change we stop creating spans for `TracingInterceptor` as this interceptor only serves as an internal helper and adds noise for the user.

- **feat(node): Update vercel ai spans as per new conventions ([#16497](https://github.com/getsentry/sentry-javascript/pull/16497))**

This feature ships updates to the span names and ops to better match OpenTelemetry. This should make them more easily accessible to the new agents module view we are building.

### Other Changes

- fix(sveltekit): Export `vercelAIIntegration` from `@sentry/node` ([#16496](https://github.com/getsentry/sentry-javascript/pull/16496))

Work in this release was contributed by @agrattan0820. Thank you for your contribution!

## 9.27.0

- feat(node): Expand how vercel ai input/outputs can be set ([#16455](https://github.com/getsentry/sentry-javascript/pull/16455))
- feat(node): Switch to new semantic conventions for Vercel AI ([#16476](https://github.com/getsentry/sentry-javascript/pull/16476))
- feat(react-router): Add component annotation plugin ([#16472](https://github.com/getsentry/sentry-javascript/pull/16472))
- feat(react-router): Export wrappers for server loaders and actions ([#16481](https://github.com/getsentry/sentry-javascript/pull/16481))
- fix(browser): Ignore unrealistically long INP values ([#16484](https://github.com/getsentry/sentry-javascript/pull/16484))
- fix(react-router): Conditionally add `ReactRouterServer` integration ([#16470](https://github.com/getsentry/sentry-javascript/pull/16470))

## 9.26.0

- feat(react-router): Re-export functions from `@sentry/react` ([#16465](https://github.com/getsentry/sentry-javascript/pull/16465))
- fix(nextjs): Skip re instrumentating on generate phase of experimental build mode ([#16410](https://github.com/getsentry/sentry-javascript/pull/16410))
- fix(node): Ensure adding sentry-trace and baggage headers via SentryHttpInstrumentation doesn't crash ([#16473](https://github.com/getsentry/sentry-javascript/pull/16473))

## 9.25.1

- fix(otel): Don't ignore child spans after the root is sent ([#16416](https://github.com/getsentry/sentry-javascript/pull/16416))

## 9.25.0

### Important Changes

- **feat(browser): Add option to ignore `mark` and `measure` spans ([#16443](https://github.com/getsentry/sentry-javascript/pull/16443))**

This release adds an option to `browserTracingIntegration` that lets you ignore
`mark` and `measure` spans created from the `performance.mark(...)` and `performance.measure(...)` browser APIs:

```js
Sentry.init({
  integrations: [
    Sentry.browserTracingIntegration({
      ignorePerformanceApiSpans: ['measure-to-ignore', /mark-to-ignore/],
    }),
  ],
});
```

### Other Changes

- feat(browser): Export getTraceData from the browser sdks ([#16433](https://github.com/getsentry/sentry-javascript/pull/16433))
- feat(node): Add `includeServerName` option ([#16442](https://github.com/getsentry/sentry-javascript/pull/16442))
- fix(nuxt): Remove setting `@sentry/nuxt` external ([#16444](https://github.com/getsentry/sentry-javascript/pull/16444))

## 9.24.0

### Important Changes

- feat(angular): Bump `@sentry/angular` peer dependencies to add Angular 20 support ([#16414](https://github.com/getsentry/sentry-javascript/pull/16414))

This release adds support for Angular 20 to the Sentry Angular SDK `@sentry/angular`.

### Other Changes

- feat(browser): Add `unregisterOriginalCallbacks` option to `browserApiErrorsIntegration` ([#16412](https://github.com/getsentry/sentry-javascript/pull/16412))
- feat(core): Add user to logs ([#16399](https://github.com/getsentry/sentry-javascript/pull/16399))
- feat(core): Make sure Supabase db query insights are populated ([#16169](https://github.com/getsentry/sentry-javascript/pull/16169))

## 9.23.0

### Important changes

- **feat(browser): option to ignore certain resource types ([#16389](https://github.com/getsentry/sentry-javascript/pull/16389))**

Adds an option to opt out of certain `resource.*` spans via `ignoreResourceSpans`.

For example, to opt out of `resource.script` spans:

```js
Sentry.browserTracingIntegration({
  ignoreResourceSpans: ['resource.script'],
}),
```

### Other changes

- feat: Export `isEnabled` from all SDKs ([#16405](https://github.com/getsentry/sentry-javascript/pull/16405))
- feat(browser): Disable client when browser extension is detected in `init()` ([#16354](https://github.com/getsentry/sentry-javascript/pull/16354))
- feat(core): Allow re-use of `captureLog` ([#16352](https://github.com/getsentry/sentry-javascript/pull/16352))
- feat(core): Export `_INTERNAL_captureSerializedLog` ([#16387](https://github.com/getsentry/sentry-javascript/pull/16387))
- feat(deps): bump @opentelemetry/semantic-conventions from 1.32.0 to 1.34.0 ([#16393](https://github.com/getsentry/sentry-javascript/pull/16393))
- feat(deps): bump @prisma/instrumentation from 6.7.0 to 6.8.2 ([#16392](https://github.com/getsentry/sentry-javascript/pull/16392))
- feat(deps): bump @sentry/cli from 2.43.0 to 2.45.0 ([#16395](https://github.com/getsentry/sentry-javascript/pull/16395))
- feat(deps): bump @sentry/webpack-plugin from 3.3.1 to 3.5.0 ([#16394](https://github.com/getsentry/sentry-javascript/pull/16394))
- feat(nextjs): Include `static/chunks/main-*` files for `widenClientFileUpload` ([#16406](https://github.com/getsentry/sentry-javascript/pull/16406))
- feat(node): Do not add HTTP & fetch span instrumentation if tracing is disabled ([#15730](https://github.com/getsentry/sentry-javascript/pull/15730))
- feat(nuxt): Added support for nuxt layers ([#16372](https://github.com/getsentry/sentry-javascript/pull/16372))
- fix(browser): Ensure logs are flushed when sendClientReports=false ([#16351](https://github.com/getsentry/sentry-javascript/pull/16351))
- fix(browser): Move `browserTracingIntegration` code to `setup` hook ([#16386](https://github.com/getsentry/sentry-javascript/pull/16386))
- fix(cloudflare): Capture exceptions thrown in hono ([#16355](https://github.com/getsentry/sentry-javascript/pull/16355))
- fix(node): Don't warn about Spotlight on empty NODE_ENV ([#16381](https://github.com/getsentry/sentry-javascript/pull/16381))
- fix(node): Suppress Spotlight calls ([#16380](https://github.com/getsentry/sentry-javascript/pull/16380))
- fix(nuxt): Add `@sentry/nuxt` as external in Rollup ([#16407](https://github.com/getsentry/sentry-javascript/pull/16407))
- fix(opentelemetry): Ensure `withScope` keeps span active & `_getTraceInfoFromScope` works ([#16385](https://github.com/getsentry/sentry-javascript/pull/16385))

Work in this release was contributed by @Xenossolitarius. Thank you for your contribution!

## 9.22.0

### Important changes

- **Revert "feat(browser): Track measure detail as span attributes" ([#16348](https://github.com/getsentry/sentry-javascript/pull/16348))**

This is a revert of a feature introduced in `9.20.0` with [#16240](https://github.com/getsentry/sentry-javascript/pull/16240). This feature was causing crashes in firefox, so we are reverting it. We will re-enable this functionality in the future after fixing the crash.

### Other changes

- feat(deps): bump @sentry/rollup-plugin from 3.1.2 to 3.2.1 ([#15511](https://github.com/getsentry/sentry-javascript/pull/15511))
- fix(remix): Use generic types for `ServerBuild` argument and return ([#16336](https://github.com/getsentry/sentry-javascript/pull/16336))

## 9.21.0

- docs: Fix v7 migration link ([#14629](https://github.com/getsentry/sentry-javascript/pull/14629))
- feat(node): Vendor in `@fastify/otel` ([#16328](https://github.com/getsentry/sentry-javascript/pull/16328))
- fix(nestjs): Handle multiple `OnEvent` decorators ([#16306](https://github.com/getsentry/sentry-javascript/pull/16306))
- fix(node): Avoid creating breadcrumbs for suppressed requests ([#16285](https://github.com/getsentry/sentry-javascript/pull/16285))
- fix(remix): Add missing `client` exports to `server` and `cloudflare` entries ([#16341](https://github.com/getsentry/sentry-javascript/pull/16341))

Work in this release was contributed by @phthhieu. Thank you for your contribution!

## 9.20.0

### Important changes

- **feat(browser): Track measure detail as span attributes ([#16240](https://github.com/getsentry/sentry-javascript/pull/16240))**

The SDK now automatically collects details passed to `performance.measure` options.

### Other changes

- feat(node): Add `maxIncomingRequestBodySize` ([#16225](https://github.com/getsentry/sentry-javascript/pull/16225))
- feat(react-router): Add server action instrumentation ([#16292](https://github.com/getsentry/sentry-javascript/pull/16292))
- feat(react-router): Filter manifest requests ([#16294](https://github.com/getsentry/sentry-javascript/pull/16294))
- feat(replay): Extend default list for masking with `aria-label` ([#16192](https://github.com/getsentry/sentry-javascript/pull/16192))
- fix(browser): Ensure pageload & navigation spans have correct data ([#16279](https://github.com/getsentry/sentry-javascript/pull/16279))
- fix(cloudflare): Account for static fields in wrapper type ([#16303](https://github.com/getsentry/sentry-javascript/pull/16303))
- fix(nextjs): Preserve `next.route` attribute on root spans ([#16297](https://github.com/getsentry/sentry-javascript/pull/16297))
- feat(node): Fork isolation scope in tRPC middleware ([#16296](https://github.com/getsentry/sentry-javascript/pull/16296))
- feat(core): Add `orgId` option to `init` and DSC (`sentry-org_id` in baggage) ([#16305](https://github.com/getsentry/sentry-javascript/pull/16305))

## 9.19.0

- feat(react-router): Add otel instrumentation for server requests ([#16147](https://github.com/getsentry/sentry-javascript/pull/16147))
- feat(remix): Vendor in `opentelemetry-instrumentation-remix` ([#16145](https://github.com/getsentry/sentry-javascript/pull/16145))
- fix(browser): Ensure spans auto-ended for navigations have `cancelled` reason ([#16277](https://github.com/getsentry/sentry-javascript/pull/16277))
- fix(node): Pin `@fastify/otel` fork to direct url to allow installing without git ([#16287](https://github.com/getsentry/sentry-javascript/pull/16287))
- fix(react): Handle nested parameterized routes in reactrouterv3 transaction normalization ([#16274](https://github.com/getsentry/sentry-javascript/pull/16274))

Work in this release was contributed by @sidx1024. Thank you for your contribution!

## 9.18.0

### Important changes

- **feat: Support Node 24 ([#16236](https://github.com/getsentry/sentry-javascript/pull/16236))**

We now also publish profiling binaries for Node 24.

### Other changes

- deps(node): Bump `import-in-the-middle` to `1.13.1` ([#16260](https://github.com/getsentry/sentry-javascript/pull/16260))
- feat: Export `consoleLoggingIntegration` from vercel edge sdk ([#16228](https://github.com/getsentry/sentry-javascript/pull/16228))
- feat(cloudflare): Add support for email, queue, and tail handler ([#16233](https://github.com/getsentry/sentry-javascript/pull/16233))
- feat(cloudflare): Improve http span data ([#16232](https://github.com/getsentry/sentry-javascript/pull/16232))
- feat(nextjs): Add more attributes for generation functions ([#16214](https://github.com/getsentry/sentry-javascript/pull/16214))
- feat(opentelemetry): Widen peer dependencies to support Otel v2 ([#16246](https://github.com/getsentry/sentry-javascript/pull/16246))
- fix(core): Gracefully handle invalid baggage entries ([#16257](https://github.com/getsentry/sentry-javascript/pull/16257))
- fix(node): Ensure traces are propagated without spans in Node 22+ ([#16221](https://github.com/getsentry/sentry-javascript/pull/16221))
- fix(node): Use sentry forked `@fastify/otel` dependency with pinned Otel v1 deps ([#16256](https://github.com/getsentry/sentry-javascript/pull/16256))
- fix(remix): Remove vendored types ([#16218](https://github.com/getsentry/sentry-javascript/pull/16218))

## 9.17.0

- feat(node): Migrate to `@fastify/otel` ([#15542](https://github.com/getsentry/sentry-javascript/pull/15542))

## 9.16.1

- fix(core): Make sure logs get flushed in server-runtime-client ([#16222](https://github.com/getsentry/sentry-javascript/pull/16222))
- ref(node): Remove vercel flushing code that does nothing ([#16217](https://github.com/getsentry/sentry-javascript/pull/16217))

## 9.16.0

### Important changes

- **feat: Create a Vite plugin that injects sentryConfig into the global config ([#16197](https://github.com/getsentry/sentry-javascript/pull/16197))**

Add a new plugin `makeConfigInjectorPlugin` within our existing vite plugin that updates the global vite config with sentry options

- **feat(browser): Add option to sample linked traces consistently ([#16037](https://github.com/getsentry/sentry-javascript/pull/16037))**

This PR implements consistent sampling across traces as outlined in ([#15754](https://github.com/getsentry/sentry-javascript/pull/15754))

- **feat(cloudflare): Add support for durable objects ([#16180](https://github.com/getsentry/sentry-javascript/pull/16180))**

This PR introduces a new `instrumentDurableObjectWithSentry` method to the SDK, which instruments durable objects. We capture both traces and errors automatically.

- **feat(node): Add Prisma integration by default ([#16073](https://github.com/getsentry/sentry-javascript/pull/16073))**

[Prisma integration](https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/integrations/prisma/) is enabled by default, it should work for both ESM and CJS.

- **feat(react-router): Add client-side router instrumentation ([#16185](https://github.com/getsentry/sentry-javascript/pull/16185))**

Adds client-side instrumentation for react router's `HydratedRouter`. To enable it, simply replace `browserTracingIntegration()` with `reactRouterTracingIntegration()` in your client-side init call.

- **fix(node): Avoid double-wrapping http module ([#16177](https://github.com/getsentry/sentry-javascript/pull/16177))**

When running your application in ESM mode, there have been scenarios that resulted in the `http`/`https` emitting duplicate spans for incoming requests. This was apparently caused by us double-wrapping the modules for incoming request isolation.

In order to solve this problem, the modules are no longer monkey patched by us for request isolation. Instead, we register diagnostics*channel hooks to handle request isolation now.
While this is generally not expected to break anything, there is one tiny change that \_may* affect you if you have been relying on very specific functionality:

The `ignoreOutgoingRequests` option of `httpIntegration` receives the `RequestOptions` as second argument. This type is not changed, however due to how the wrapping now works, we no longer pass through the full RequestOptions, but re-construct this partially based on the generated request. For the vast majority of cases, this should be fine, but for the sake of completeness, these are the only fields that may be available there going forward - other fields that _may_ have existed before may no longer be set:

```ts
ignoreOutgoingRequests(url: string, {
  method: string;
  protocol: string;
  host: string;
  hostname: string; // same as host
  path: string;
  headers: OutgoingHttpHeaders;
})
```

### Other changes

- feat(cloudflare): Add logs exports ([#16165](https://github.com/getsentry/sentry-javascript/pull/16165))
- feat(vercel-edge): Add logs export ([#16166](https://github.com/getsentry/sentry-javascript/pull/16166))
- feat(cloudflare): Read `SENTRY_RELEASE` from `env` ([#16201](https://github.com/getsentry/sentry-javascript/pull/16201))
- feat(node): Drop `http.server` spans with 404 status by default ([#16205](https://github.com/getsentry/sentry-javascript/pull/16205))
- fix(browser): Respect manually set sentry tracing headers in XHR requests ([#16184](https://github.com/getsentry/sentry-javascript/pull/16184))
- fix(core): Respect manually set sentry tracing headers in fetch calls ([#16183](https://github.com/getsentry/sentry-javascript/pull/16183))
- fix(feedback): Prevent `removeFromDom()` from throwing ([#16030](https://github.com/getsentry/sentry-javascript/pull/16030))
- fix(node): Use class constructor in docstring for winston transport ([#16167](https://github.com/getsentry/sentry-javascript/pull/16167))
- fix(node): Fix vercel flushing logic & add test for it ([#16208](https://github.com/getsentry/sentry-javascript/pull/16208))
- fix(node): Fix 404 route handling in express 5 ([#16211](https://github.com/getsentry/sentry-javascript/pull/16211))
- fix(logs): Ensure logs can be flushed correctly ([#16216](https://github.com/getsentry/sentry-javascript/pull/16216))
- ref(core): Switch to standardized log envelope ([#16133](https://github.com/getsentry/sentry-javascript/pull/16133))

## 9.15.0

### Important Changes

- **feat: Export `wrapMcpServerWithSentry` from server packages ([#16127](https://github.com/getsentry/sentry-javascript/pull/16127))**

Exports the wrapMcpServerWithSentry which is our MCP server instrumentation from all the server packages.

- **feat(core): Associate resource/tool/prompt invocations with request span instead of response span ([#16126](https://github.com/getsentry/sentry-javascript/pull/16126))**

Adds a best effort mechanism to associate handler spans for `resource`, `tool` and `prompt` with the incoming message requests instead of the outgoing SSE response.

### Other Changes

- fix: Vercel `ai` ESM patching ([#16152](https://github.com/getsentry/sentry-javascript/pull/16152))
- fix(node): Update version range for `module.register` ([#16125](https://github.com/getsentry/sentry-javascript/pull/16125))
- fix(react-router): Spread `unstable_sentryVitePluginOptions` correctly ([#16156](https://github.com/getsentry/sentry-javascript/pull/16156))
- fix(react): Fix Redux integration failing with reducer injection ([#16106](https://github.com/getsentry/sentry-javascript/pull/16106))
- fix(remix): Add ESM-compatible exports ([#16124](https://github.com/getsentry/sentry-javascript/pull/16124))
- fix(remix): Avoid rewrapping root loader. ([#16136](https://github.com/getsentry/sentry-javascript/pull/16136))

Work in this release was contributed by @AntoineDuComptoirDesPharmacies. Thank you for your contribution!

## 9.14.0

### Important Changes

- **feat: Add Supabase Integration ([#15719](https://github.com/getsentry/sentry-javascript/pull/15719))**

This PR adds Supabase integration to `@sentry/core`, allowing automatic instrumentation of Supabase client operations (database queries and authentication) for performance monitoring and error tracking.

- **feat(nestjs): Gracefully handle RPC scenarios in `SentryGlobalFilter` ([#16066](https://github.com/getsentry/sentry-javascript/pull/16066))**

This PR adds better RPC exception handling to `@sentry/nestjs`, preventing application crashes while still capturing errors and warning users when a dedicated filter is needed. The implementation gracefully handles the 'rpc' context type in `SentryGlobalFilter` to improve reliability in hybrid applications.

- **feat(react-router): Trace propagation ([#16070](https://github.com/getsentry/sentry-javascript/pull/16070))**

This PR adds trace propagation to `@sentry/react-router` by providing utilities to inject trace meta tags into HTML headers and offering a pre-built Sentry-instrumented request handler, improving distributed tracing capabilities across page loads.

### Other Changes

- feat(deps): Bump @prisma/instrumentation from 6.5.0 to 6.6.0 ([#16102](https://github.com/getsentry/sentry-javascript/pull/16102))
- feat(nextjs): Improve server component data ([#15996](https://github.com/getsentry/sentry-javascript/pull/15996))
- feat(nuxt): Log when adding HTML trace meta tags ([#16044](https://github.com/getsentry/sentry-javascript/pull/16044))
- fix(node): Make body capturing more robust ([#16105](https://github.com/getsentry/sentry-javascript/pull/16105))
- ref(node): Log when incoming request bodies are being captured ([#16104](https://github.com/getsentry/sentry-javascript/pull/16104))

## 9.13.0

### Important Changes

- **feat(node): Add support for winston logger ([#15983](https://github.com/getsentry/sentry-javascript/pull/15983))**

  Sentry is adding support for [structured logging](https://github.com/getsentry/sentry-javascript/discussions/15916). In this release we've added support for sending logs to Sentry via the [winston](https://github.com/winstonjs/winston) logger to the Sentry Node SDK (and SDKs that use the Node SDK under the hood like `@sentry/nestjs`). The Logging APIs in the Sentry SDK are still experimental and subject to change.

  ```js
  const winston = require('winston');
  const Transport = require('winston-transport');

  const transport = Sentry.createSentryWinstonTransport(Transport);

  const logger = winston.createLogger({
    transports: [transport],
  });
  ```

- **feat(core): Add `wrapMcpServerWithSentry` to instrument MCP servers from `@modelcontextprotocol/sdk` ([#16032](https://github.com/getsentry/sentry-javascript/pull/16032))**

  The Sentry SDK now supports instrumenting MCP servers from the `@modelcontextprotocol/sdk` package. Compatible with versions `^1.9.0` of the `@modelcontextprotocol/sdk` package.

  ```js
  import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

  // Create an MCP server
  const server = new McpServer({
    name: 'Demo',
    version: '1.0.0',
  });

  // Use the instrumented server in your application
  const instrumentedServer = Sentry.wrapMcpServerWithSentry(server);
  ```

- **feat(core): Move console integration into core and add to cloudflare/vercel-edge ([#16024](https://github.com/getsentry/sentry-javascript/pull/16024))**

  Console instrumentation has been added to `@sentry/cloudflare` and `@sentry/nextjs` Edge Runtime and is enabled by default. Now calls to the console object will be captured as breadcrumbs for those SDKs.

- **feat(bun): Support new `Bun.serve` APIs ([#16035](https://github.com/getsentry/sentry-javascript/pull/16035))**

  Bun `1.2.6` and above have a new `Bun.serve` API, which the Bun SDK now supports. The SDK instruments the new routes object that can be used to define routes for the server.

  Thanks to @Jarred-Sumner for helping us get this supported!

### Other Changes

- feat(browser): Warn on duplicate `browserTracingIntegration` ([#16042](https://github.com/getsentry/sentry-javascript/pull/16042))
- feat(core): Allow delayed sending with offline transport ([#15937](https://github.com/getsentry/sentry-javascript/pull/15937))
- feat(deps): Bump @sentry/webpack-plugin from 3.2.4 to 3.3.1 ([#16057](https://github.com/getsentry/sentry-javascript/pull/16057))
- feat(vue): Apply stateTransformer to attachments in Pinia Plugin ([#16034](https://github.com/getsentry/sentry-javascript/pull/16034))
- fix(core): Run `beforeSendLog` after we process log ([#16019](https://github.com/getsentry/sentry-javascript/pull/16019))
- fix(nextjs): Don't show turbopack warning for newer Next.js canaries ([#16065](https://github.com/getsentry/sentry-javascript/pull/16065))
- fix(nextjs): Include patch version 0 for min supported 15.3.0 ([#16026](https://github.com/getsentry/sentry-javascript/pull/16026))
- fix(node): Ensure late init works with all integrations ([#16016](https://github.com/getsentry/sentry-javascript/pull/16016))
- fix(react-router): Pass `unstable_sentryVitePluginOptions` to cli instance ([#16033](https://github.com/getsentry/sentry-javascript/pull/16033))
- fix(serverless-aws): Overwrite root span name with GraphQL if set ([#16010](https://github.com/getsentry/sentry-javascript/pull/16010))

## 9.12.0

### Important Changes

- **feat(feedback): Implement highlighting and hiding controls for screenshots ([#15951](https://github.com/getsentry/sentry-javascript/pull/15951))**

  The Sentry SDK now supports highlighting and hiding controls for screenshots in [user feedback reports](https://docs.sentry.io/platforms/javascript/user-feedback/). This functionality is enabled by default.

- **feat(node): Add `ignoreIncomingRequestBody` callback to `httpIntegration` ([#15959](https://github.com/getsentry/sentry-javascript/pull/15959))**

  The `httpIntegration` now supports an optional `ignoreIncomingRequestBody` callback that can be used to skip capturing the body of incoming requests.

  ```ts
  Sentry.init({
    integrations: [
      Sentry.httpIntegration({
        ignoreIncomingRequestBody: (url, request) => {
          return request.method === 'GET' && url.includes('/api/large-payload');
        },
      }),
    ],
  });
  ```

  The `ignoreIncomingRequestBody` callback receives the URL of the request and should return `true` if the body should be ignored.

- **Logging Improvements**

  Sentry is adding support for [structured logging](https://github.com/getsentry/sentry-javascript/discussions/15916). In this release we've made a variety of improvements to logging functionality in the Sentry SDKs.

  - feat(node): Add server.address to nodejs logs ([#16006](https://github.com/getsentry/sentry-javascript/pull/16006))
  - feat(core): Add sdk name and version to logs ([#16005](https://github.com/getsentry/sentry-javascript/pull/16005))
  - feat(core): Add sentry origin attribute to console logs integration ([#15998](https://github.com/getsentry/sentry-javascript/pull/15998))
  - fix(core): Do not abbreviate message parameter attribute ([#15987](https://github.com/getsentry/sentry-javascript/pull/15987))
  - fix(core): Prefix release and environment correctly ([#15999](https://github.com/getsentry/sentry-javascript/pull/15999))
  - fix(node): Make log flushing logic more robust ([#15991](https://github.com/getsentry/sentry-javascript/pull/15991))

### Other Changes

- build(aws-serverless): Include debug logs in lambda layer SDK bundle ([#15974](https://github.com/getsentry/sentry-javascript/pull/15974))
- feat(astro): Add tracking of errors during HTML streaming ([#15995](https://github.com/getsentry/sentry-javascript/pull/15995))
- feat(browser): Add `onRequestSpanStart` hook to browser tracing integration ([#15979](https://github.com/getsentry/sentry-javascript/pull/15979))
- feat(deps): Bump @sentry/cli from 2.42.3 to 2.43.0 ([#16001](https://github.com/getsentry/sentry-javascript/pull/16001))
- feat(nextjs): Add `captureRouterTransitionStart` hook for capturing navigations ([#15981](https://github.com/getsentry/sentry-javascript/pull/15981))
- feat(nextjs): Mark clientside prefetch request spans with `http.request.prefetch: true` attribute ([#15980](https://github.com/getsentry/sentry-javascript/pull/15980))
- feat(nextjs): Un experimentify `clientInstrumentationHook` ([#15992](https://github.com/getsentry/sentry-javascript/pull/15992))
- feat(nextjs): Warn when client was initialized more than once ([#15971](https://github.com/getsentry/sentry-javascript/pull/15971))
- feat(node): Add support for `SENTRY_DEBUG` env variable ([#15972](https://github.com/getsentry/sentry-javascript/pull/15972))
- fix(tss-react): Change `authToken` type to `string` ([#15985](https://github.com/getsentry/sentry-javascript/pull/15985))

Work in this release was contributed by @Page- and @Fryuni. Thank you for your contributions!

## 9.11.0

- feat(browser): Add `http.redirect_count` attribute to `browser.redirect` span ([#15943](https://github.com/getsentry/sentry-javascript/pull/15943))
- feat(core): Add `consoleLoggingIntegration` for logs ([#15955](https://github.com/getsentry/sentry-javascript/pull/15955))
- feat(core): Don't truncate error messages ([#15818](https://github.com/getsentry/sentry-javascript/pull/15818))
- feat(core): Emit debug log when transport execution fails ([#16009](https://github.com/getsentry/sentry-javascript/pull/16009))
- feat(nextjs): Add release injection in Turbopack ([#15958](https://github.com/getsentry/sentry-javascript/pull/15958))
- feat(nextjs): Record `turbopack` as tag ([#15928](https://github.com/getsentry/sentry-javascript/pull/15928))
- feat(nuxt): Base decision on source maps upload only on Nuxt source map settings ([#15859](https://github.com/getsentry/sentry-javascript/pull/15859))
- feat(react-router): Add `sentryHandleRequest` ([#15787](https://github.com/getsentry/sentry-javascript/pull/15787))
- fix(node): Use `module` instead of `require` for CJS check ([#15927](https://github.com/getsentry/sentry-javascript/pull/15927))
- fix(remix): Remove mentions of deprecated `ErrorBoundary` wrapper ([#15930](https://github.com/getsentry/sentry-javascript/pull/15930))
- ref(browser): Temporarily add `sentry.previous_trace` span attribute ([#15957](https://github.com/getsentry/sentry-javascript/pull/15957))
- ref(browser/core): Move all log flushing logic into clients ([#15831](https://github.com/getsentry/sentry-javascript/pull/15831))
- ref(core): Improve URL parsing utilities ([#15882](https://github.com/getsentry/sentry-javascript/pull/15882))

## 9.10.1

- fix: Correct @sentry-internal/feedback docs to match the code ([#15874](https://github.com/getsentry/sentry-javascript/pull/15874))
- deps: Bump bundler plugins to version `3.2.4` ([#15909](https://github.com/getsentry/sentry-javascript/pull/15909))

## 9.10.0

### Important Changes

- **feat: Add support for logs**

  - feat(node): Add logging public APIs to Node SDKs ([#15764](https://github.com/getsentry/sentry-javascript/pull/15764))
  - feat(core): Add support for `beforeSendLog` ([#15814](https://github.com/getsentry/sentry-javascript/pull/15814))
  - feat(core): Add support for parameterizing logs ([#15812](https://github.com/getsentry/sentry-javascript/pull/15812))
  - fix: Remove critical log severity level ([#15824](https://github.com/getsentry/sentry-javascript/pull/15824))

  All JavaScript SDKs other than `@sentry/cloudflare` and `@sentry/deno` now support sending logs via dedicated methods as part of Sentry's [upcoming logging product](https://github.com/getsentry/sentry/discussions/86804).

  Logging is gated by an experimental option, `_experiments.enableLogs`.

  ```js
  Sentry.init({
    dsn: 'PUBLIC_DSN',
    // `enableLogs` must be set to true to use the logging features
    _experiments: { enableLogs: true },
  });

  const { trace, debug, info, warn, error, fatal, fmt } = Sentry.logger;

  trace('Starting database connection', { database: 'users' });
  debug('Cache miss for user', { userId: 123 });
  error('Failed to process payment', { orderId: 'order_123', amount: 99.99 });
  fatal('Database connection pool exhausted', { database: 'users', activeConnections: 100 });

  // Structured logging via the `fmt` helper function. When you use `fmt`, the string template and parameters are sent separately so they can be queried independently in Sentry.

  info(fmt(`Updated profile for user ${userId}`));
  warn(fmt(`Rate limit approaching for endpoint ${endpoint}. Requests: ${requests}, Limit: ${limit}`));
  ```

  With server-side SDKs like `@sentry/node`, `@sentry/bun` or server-side of `@sentry/nextjs` or `@sentry/sveltekit`, you can do structured logging without needing the `fmt` helper function.

  ```js
  const { info, warn } = Sentry.logger;

  info('User %s logged in successfully', [123]);
  warn('Failed to load user %s data', [123], { errorCode: 404 });
  ```

  To filter logs, or update them before they are sent to Sentry, you can use the `_experiments.beforeSendLog` option.

- **feat(browser): Add `diagnoseSdkConnectivity()` function to programmatically detect possible connectivity issues ([#15821](https://github.com/getsentry/sentry-javascript/pull/15821))**

  The `diagnoseSdkConnectivity()` function can be used to programmatically detect possible connectivity issues with the Sentry SDK.

  ```js
  const result = await Sentry.diagnoseSdkConnectivity();
  ```

  The result will be an object with the following properties:

  - `"no-client-active"`: There was no active client when the function was called. This possibly means that the SDK was not initialized yet.
  - `"sentry-unreachable"`: The Sentry SaaS servers were not reachable. This likely means that there is an ad blocker active on the page or that there are other connection issues.
  - `undefined`: The SDK is working as expected.

- **SDK Tracing Performance Improvements for Node SDKs**

  - feat: Stop using `dropUndefinedKeys` ([#15796](https://github.com/getsentry/sentry-javascript/pull/15796))
  - feat(node): Only add span listeners for instrumentation when used ([#15802](https://github.com/getsentry/sentry-javascript/pull/15802))
  - ref: Avoid `dropUndefinedKeys` for `spanToJSON` calls ([#15792](https://github.com/getsentry/sentry-javascript/pull/15792))
  - ref: Avoid using `SentryError` for PromiseBuffer control flow ([#15822](https://github.com/getsentry/sentry-javascript/pull/15822))
  - ref: Stop using `dropUndefinedKeys` in SpanExporter ([#15794](https://github.com/getsentry/sentry-javascript/pull/15794))
  - ref(core): Avoid using `SentryError` for event processing control flow ([#15823](https://github.com/getsentry/sentry-javascript/pull/15823))
  - ref(node): Avoid `dropUndefinedKeys` in Node SDK init ([#15797](https://github.com/getsentry/sentry-javascript/pull/15797))
  - ref(opentelemetry): Avoid sampling work for non-root spans ([#15820](https://github.com/getsentry/sentry-javascript/pull/15820))

  We've been hard at work making performance improvements to the Sentry Node SDKs (`@sentry/node`, `@sentry/aws-serverless`, `@sentry/nestjs`, etc.). We've seen that upgrading from `9.7.0` to `9.10.0` leads to 30-40% improvement in request latency for HTTP web-server applications that use tracing with high sample rates. Non web-server applications and non-tracing applications will see smaller improvements.

### Other Changes

- chore(deps): Bump `rrweb` to `2.35.0` ([#15825](https://github.com/getsentry/sentry-javascript/pull/15825))
- deps: Bump bundler plugins to `3.2.3` ([#15829](https://github.com/getsentry/sentry-javascript/pull/15829))
- feat: Always truncate stored breadcrumb messages to 2kb ([#15819](https://github.com/getsentry/sentry-javascript/pull/15819))
- feat(nextjs): Disable server webpack-handling for static builds ([#15751](https://github.com/getsentry/sentry-javascript/pull/15751))
- fix(nuxt): Don't override Nuxt options if undefined ([#15795](https://github.com/getsentry/sentry-javascript/pull/15795))

## 9.9.0

### Important Changes

- **feat(nextjs): Support `instrumentation-client.ts` ([#15705](https://github.com/getsentry/sentry-javascript/pull/15705))**

  Next.js recently added a feature to support [client-side (browser) instrumentation via a `instrumentation-client.ts` file](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client).

  To be forwards compatible, the Sentry Next.js SDK will now pick up `instrumentation-client.ts` files even on older Next.js versions and add them to your client bundles.
  It is suggested that you either rename your `sentry.client.config.ts` file to `instrumentation-client.ts`, or if you already happen to have a `instrumentation-client.ts` file move the contents of `sentry.client.config.ts` to `instrumentation-client.ts`.

- **feat(browser): Add `previous_trace` span links ([#15569](https://github.com/getsentry/sentry-javascript/pull/15569))**

  The `@sentry/browser` SDK and SDKs based on `@sentry/browser` now emits a link from the first root span of a newly started trace to the root span of a previously started trace. You can control this feature via an option in `browserTracingIntegration()`:

  ```js
  Sentry.init({
    dsn: 'your-dsn-here'
    integrations: [
      Sentry.browserTracingIntegration({
        // Available settings:
        // - 'in-memory' (default): Stores previous trace information in memory
        // - 'session-storage': Stores previous trace information in the browser's `sessionStorage`
        // - 'off': Disable storing and sending previous trace information
        linkPreviousTrace: 'in-memory',
      }),
    ],
  });
  ```

- **feat(browser): Add `logger.X` methods to browser SDK ([#15763](https://github.com/getsentry/sentry-javascript/pull/15763))**

  For Sentry's [upcoming logging product](https://github.com/getsentry/sentry/discussions/86804), the SDK now supports sending logs via dedicated methods.

  ```js
  Sentry.init({
    dsn: 'your-dsn-here',
    _experiments: {
      enableLogs: true, // This is required to use the logging features
    },
  });

  Sentry.logger.info('This is a trace message', { userId: 123 });
  // See PR for better documentation
  ```

  Please note that the logs product is still in early access. See the link above for more information.

### Other Changes

- feat(browser): Attach host as part of error message to "Failed to fetch" errors ([#15729](https://github.com/getsentry/sentry-javascript/pull/15729))
- feat(core): Add `parseStringToURL` method ([#15768](https://github.com/getsentry/sentry-javascript/pull/15768))
- feat(core): Optimize `dropUndefinedKeys` ([#15760](https://github.com/getsentry/sentry-javascript/pull/15760))
- feat(node): Add fastify `shouldHandleError` ([#15771](https://github.com/getsentry/sentry-javascript/pull/15771))
- fix(nuxt): Delete no longer needed Nitro 'close' hook ([#15790](https://github.com/getsentry/sentry-javascript/pull/15790))
- perf(nestjs): Remove usage of `addNonEnumerableProperty` ([#15766](https://github.com/getsentry/sentry-javascript/pull/15766))
- ref: Avoid some usage of `dropUndefinedKeys()` ([#15757](https://github.com/getsentry/sentry-javascript/pull/15757))
- ref: Remove some usages of `dropUndefinedKeys()` ([#15781](https://github.com/getsentry/sentry-javascript/pull/15781))
- ref(nextjs): Fix Next.js vercel-edge runtime package information ([#15789](https://github.com/getsentry/sentry-javascript/pull/15789))

## 9.8.0

- feat(node): Implement new continuous profiling API spec ([#15635](https://github.com/getsentry/sentry-javascript/pull/15635))
- feat(profiling): Add platform to chunk envelope ([#15758](https://github.com/getsentry/sentry-javascript/pull/15758))
- feat(react): Export captureReactException method ([#15746](https://github.com/getsentry/sentry-javascript/pull/15746))
- fix(node): Check for `res.end` before passing to Proxy ([#15776](https://github.com/getsentry/sentry-javascript/pull/15776))
- perf(core): Add short-circuits to `eventFilters` integration ([#15752](https://github.com/getsentry/sentry-javascript/pull/15752))
- perf(node): Short circuit flushing on Vercel only for Vercel ([#15734](https://github.com/getsentry/sentry-javascript/pull/15734))

## 9.7.0

- feat(core): Add `captureLog` method ([#15717](https://github.com/getsentry/sentry-javascript/pull/15717))
- feat(remix/cloudflare): Export `sentryHandleError` ([#15726](https://github.com/getsentry/sentry-javascript/pull/15726))
- fix(node): Always flush on Vercel before Lambda freeze ([#15602](https://github.com/getsentry/sentry-javascript/pull/15602))
- fix(node): Ensure incoming traces are propagated without HttpInstrumentation ([#15732](https://github.com/getsentry/sentry-javascript/pull/15732))
- fix(node): Use `fatal` level for unhandled rejections in `strict` mode ([#15720](https://github.com/getsentry/sentry-javascript/pull/15720))
- fix(nuxt): Delete Nuxt server template injection ([#15749](https://github.com/getsentry/sentry-javascript/pull/15749))

## 9.6.1

- feat(deps): bump @prisma/instrumentation from 6.4.1 to 6.5.0 ([#15714](https://github.com/getsentry/sentry-javascript/pull/15714))
- feat(deps): bump @sentry/cli from 2.42.2 to 2.42.3 ([#15711](https://github.com/getsentry/sentry-javascript/pull/15711))
- fix(nextjs): Re-patch router if it is overridden by Next.js ([#15721](https://github.com/getsentry/sentry-javascript/pull/15721))
- fix(nuxt): Add Nitro Rollup plugin to inject Sentry server config ([#15710](https://github.com/getsentry/sentry-javascript/pull/15710))
- chore(deps): Bump rollup to 4.35.0 ([#15651](https://github.com/getsentry/sentry-javascript/pull/15651))

## 9.6.0

### Important Changes

- **feat(tanstackstart): Add `@sentry/tanstackstart-react` package and make `@sentry/tanstackstart` package a utility package ([#15629](https://github.com/getsentry/sentry-javascript/pull/15629))**

  Since TanStack Start is supposed to be a generic framework that supports libraries like React and Solid, the `@sentry/tanstackstart` SDK package was renamed to `@sentry/tanstackstart-react` to reflect that the SDK is specifically intended to be used for React TanStack Start applications.
  Note that the TanStack Start SDK is still in alpha status and may be subject to breaking changes in non-major package updates.

### Other Changes

- feat(astro): Accept all vite-plugin options ([#15638](https://github.com/getsentry/sentry-javascript/pull/15638))
- feat(deps): bump @sentry/webpack-plugin from 3.2.1 to 3.2.2 ([#15627](https://github.com/getsentry/sentry-javascript/pull/15627))
- feat(tanstackstart): Refine initial API ([#15574](https://github.com/getsentry/sentry-javascript/pull/15574))
- fix(core): Ensure `fill` only patches functions ([#15632](https://github.com/getsentry/sentry-javascript/pull/15632))
- fix(nextjs): Consider `pageExtensions` when looking for instrumentation file ([#15701](https://github.com/getsentry/sentry-javascript/pull/15701))
- fix(remix): Null-check `options` ([#15610](https://github.com/getsentry/sentry-javascript/pull/15610))
- fix(sveltekit): Correctly parse angle bracket type assertions for auto instrumentation ([#15578](https://github.com/getsentry/sentry-javascript/pull/15578))
- fix(sveltekit): Guard process variable ([#15605](https://github.com/getsentry/sentry-javascript/pull/15605))

Work in this release was contributed by @angelikatyborska and @nwalters512. Thank you for your contributions!

## 9.5.0

### Important Changes

We found some issues with the new feedback screenshot annotation where screenshots are not being generated properly. Due to this issue, we are reverting the feature.

- Revert "feat(feedback) Allowing annotation via highlighting & masking ([#15484](https://github.com/getsentry/sentry-javascript/pull/15484))" (#15609)

### Other Changes

- Add cloudflare adapter detection and path generation ([#15603](https://github.com/getsentry/sentry-javascript/pull/15603))
- deps(nextjs): Bump rollup to `4.34.9` ([#15589](https://github.com/getsentry/sentry-javascript/pull/15589))
- feat(bun): Automatically add performance integrations ([#15586](https://github.com/getsentry/sentry-javascript/pull/15586))
- feat(replay): Bump rrweb to 2.34.0 ([#15580](https://github.com/getsentry/sentry-javascript/pull/15580))
- fix(browser): Call original function on early return from patched history API ([#15576](https://github.com/getsentry/sentry-javascript/pull/15576))
- fix(nestjs): Copy metadata in custom decorators ([#15598](https://github.com/getsentry/sentry-javascript/pull/15598))
- fix(react-router): Fix config type import ([#15583](https://github.com/getsentry/sentry-javascript/pull/15583))
- fix(remix): Use correct types export for `@sentry/remix/cloudflare` ([#15599](https://github.com/getsentry/sentry-javascript/pull/15599))
- fix(vue): Attach Pinia state only once per event ([#15588](https://github.com/getsentry/sentry-javascript/pull/15588))

Work in this release was contributed by @msurdi-a8c, @namoscato, and @rileyg98. Thank you for your contributions!

## 9.4.0

- feat(core): Add types for logs protocol and envelope ([#15530](https://github.com/getsentry/sentry-javascript/pull/15530))
- feat(deps): Bump `@sentry/cli` from 2.41.1 to 2.42.2 ([#15510](https://github.com/getsentry/sentry-javascript/pull/15510))
- feat(deps): Bump `@sentry/webpack-plugin` from 3.1.2 to 3.2.1 ([#15512](https://github.com/getsentry/sentry-javascript/pull/15512))
- feat(feedback) Allowing annotation via highlighting & masking ([#15484](https://github.com/getsentry/sentry-javascript/pull/15484))
- feat(nextjs): Add `use client` directive to client SDK entrypoints ([#15575](https://github.com/getsentry/sentry-javascript/pull/15575))
- feat(nextjs): Allow silencing of instrumentation warning ([#15555](https://github.com/getsentry/sentry-javascript/pull/15555))
- feat(sveltekit): Ensure `AsyncLocalStorage` async context strategy is used in Cloudflare Pages ([#15557](https://github.com/getsentry/sentry-javascript/pull/15557))
- fix(cloudflare): Make `@cloudflare/workers-types` an optional peer dependency ([#15554](https://github.com/getsentry/sentry-javascript/pull/15554))
- fix(core): Don't reverse values in event filters ([#15584](https://github.com/getsentry/sentry-javascript/pull/15584))
- fix(core): Handle normalization of null prototypes correctly ([#15556](https://github.com/getsentry/sentry-javascript/pull/15556))
- fix(nextjs): Only warn on missing `onRequestError` in version 15 ([#15553](https://github.com/getsentry/sentry-javascript/pull/15553))
- fix(node): Allow for `undefined` transport to be passed in ([#15560](https://github.com/getsentry/sentry-javascript/pull/15560))
- fix(wasm): Fix wasm integration stacktrace parsing for filename ([#15572](https://github.com/getsentry/sentry-javascript/pull/15572))
- perf(node): Store normalized request for processing ([#15570](https://github.com/getsentry/sentry-javascript/pull/15570))

## 9.3.0

### Important Changes

With this release we're publishing two new SDKs in **experimental alpha** stage:

- **feat(tanstackstart): Add TanStack Start SDK ([#15523](https://github.com/getsentry/sentry-javascript/pull/15523))**

For details please refer to the [README](https://github.com/getsentry/sentry-javascript/tree/develop/packages/tanstackstart)

- **feat(react-router): Add React Router SDK ([#15524](https://github.com/getsentry/sentry-javascript/pull/15524))**

For details please refer to the [README](https://github.com/getsentry/sentry-javascript/tree/develop/packages/react-router)

- **feat(remix): Add support for Hydrogen ([#15450](https://github.com/getsentry/sentry-javascript/pull/15450))**

This PR adds support for Shopify Hydrogen applications running on MiniOxygen runtime.

### Other Changes

- feat(core): Add `forceTransaction` to trpc middleware options ([#15519](https://github.com/getsentry/sentry-javascript/pull/15519))
- feat(core): Default filter unactionable error ([#15527](https://github.com/getsentry/sentry-javascript/pull/15527))
- feat(core): Rename `inboundFiltersIntegration` to `eventFiltersIntegration` ([#15434](https://github.com/getsentry/sentry-javascript/pull/15434))
- feat(deps): bump @prisma/instrumentation from 6.2.1 to 6.4.1 ([#15480](https://github.com/getsentry/sentry-javascript/pull/15480))
- feat(react-router): Add build-time config ([#15406](https://github.com/getsentry/sentry-javascript/pull/15406))
- feat(replay): Bump rrweb to 2.33.0 ([#15514](https://github.com/getsentry/sentry-javascript/pull/15514))
- fix(core): Fix `allowUrls` and `denyUrls` for linked and aggregate exceptions ([#15521](https://github.com/getsentry/sentry-javascript/pull/15521))
- fix(nextjs): Don't capture devmode server-action redirect errors ([#15485](https://github.com/getsentry/sentry-javascript/pull/15485))
- fix(nextjs): warn about missing onRequestError handler [#15488](https://github.com/getsentry/sentry-javascript/pull/15488))
- fix(nextjs): Prevent wrong culprit from showing up for clientside error events [#15475](https://github.com/getsentry/sentry-javascript/pull/15475))
- fix(nuxt): Ignore 300-400 status codes on app errors in Nuxt ([#15473](https://github.com/getsentry/sentry-javascript/pull/15473))
- fix(react): Add support for cross-usage of React Router instrumentations ([#15283](https://github.com/getsentry/sentry-javascript/pull/15283))
- fix(sveltekit): Guard `process` check when flushing events ([#15516](https://github.com/getsentry/sentry-javascript/pull/15516))

Work in this release was contributed by @GerryWilko and @leoambio. Thank you for your contributions!

## 9.2.0

### Important Changes

- **feat(node): Support Express v5 ([#15380](https://github.com/getsentry/sentry-javascript/pull/15380))**

This release adds full tracing support for Express v5, and improves tracing support for Nest.js 11 (which uses Express v5) in the Nest.js SDK.

- **feat(sveltekit): Add Support for Cloudflare ([#14672](https://github.com/getsentry/sentry-javascript/pull/14672))**

This release adds support for deploying SvelteKit applications to Cloudflare Pages.
A docs update with updated instructions will follow shortly.
Until then, you can give this a try by setting up the SvelteKit SDK as usual and then following the instructions outlined in the PR.

Thank you @SG60 for contributing this feature!

### Other Changes

- feat(core): Add `addLink(s)` to Sentry span ([#15452](https://github.com/getsentry/sentry-javascript/pull/15452))
- feat(core): Add links to span options ([#15453](https://github.com/getsentry/sentry-javascript/pull/15453))
- feat(deps): Bump @sentry/webpack-plugin from 2.22.7 to 3.1.2 ([#15328](https://github.com/getsentry/sentry-javascript/pull/15328))
- feat(feedback): Disable Feedback submit & cancel buttons while submitting ([#15408](https://github.com/getsentry/sentry-javascript/pull/15408))
- feat(nextjs): Add experimental flag to not strip origin information from different origin stack frames ([#15418](https://github.com/getsentry/sentry-javascript/pull/15418))
- feat(nuxt): Add `enableNitroErrorHandler` to server options ([#15444](https://github.com/getsentry/sentry-javascript/pull/15444))
- feat(opentelemetry): Add `addLink(s)` to span ([#15387](https://github.com/getsentry/sentry-javascript/pull/15387))
- feat(opentelemetry): Add `links` to span options ([#15403](https://github.com/getsentry/sentry-javascript/pull/15403))
- feat(replay): Expose rrweb recordCrossOriginIframes under \_experiments ([#14916](https://github.com/getsentry/sentry-javascript/pull/14916))
- fix(browser): Ensure that `performance.measure` spans have a positive duration ([#15415](https://github.com/getsentry/sentry-javascript/pull/15415))
- fix(bun): Includes correct sdk metadata ([#15459](https://github.com/getsentry/sentry-javascript/pull/15459))
- fix(core): Add Google `gmo` error to Inbound Filters ([#15432](https://github.com/getsentry/sentry-javascript/pull/15432))
- fix(core): Ensure `http.client` span descriptions don't contain query params or fragments ([#15404](https://github.com/getsentry/sentry-javascript/pull/15404))
- fix(core): Filter out unactionable Facebook Mobile browser error ([#15430](https://github.com/getsentry/sentry-javascript/pull/15430))
- fix(nestjs): Pin dependency on `@opentelemetry/instrumentation` ([#15419](https://github.com/getsentry/sentry-javascript/pull/15419))
- fix(nuxt): Only use filename with file extension from command ([#15445](https://github.com/getsentry/sentry-javascript/pull/15445))
- fix(nuxt): Use `SentryNuxtServerOptions` type for server init ([#15441](https://github.com/getsentry/sentry-javascript/pull/15441))
- fix(sveltekit): Avoid loading vite config to determine source maps setting ([#15440](https://github.com/getsentry/sentry-javascript/pull/15440))
- ref(profiling-node): Bump chunk interval to 60s ([#15361](https://github.com/getsentry/sentry-javascript/pull/15361))

Work in this release was contributed by @6farer, @dgavranic and @SG60. Thank you for your contributions!

## 9.1.0

- feat(browser): Add `graphqlClientIntegration` ([#13783](https://github.com/getsentry/sentry-javascript/pull/13783))
- feat(core): Allow for nested trpc context ([#15379](https://github.com/getsentry/sentry-javascript/pull/15379))
- feat(core): Create types and utilities for span links ([#15375](https://github.com/getsentry/sentry-javascript/pull/15375))
- feat(deps): bump @opentelemetry/instrumentation-pg from 0.50.0 to 0.51.0 ([#15273](https://github.com/getsentry/sentry-javascript/pull/15273))
- feat(node): Extract Sentry-specific node-fetch instrumentation ([#15231](https://github.com/getsentry/sentry-javascript/pull/15231))
- feat(vue): Support Pinia v3 ([#15383](https://github.com/getsentry/sentry-javascript/pull/15383))
- fix(sveltekit): Avoid request body double read errors ([#15368](https://github.com/getsentry/sentry-javascript/pull/15368))
- fix(sveltekit): Avoid top-level `vite` import ([#15371](https://github.com/getsentry/sentry-javascript/pull/15371))

Work in this release was contributed by @Zen-cronic and @filips-alpe. Thank you for your contribution!

## 9.0.1

- ref(flags): rename unleash integration param ([#15343](https://github.com/getsentry/sentry-javascript/pull/15343))

## 9.0.0

Version `9.0.0` marks a release of the Sentry JavaScript SDKs that contains breaking changes.
The goal of this release is to trim down on unused and potentially confusing APIs, prepare the SDKs for future framework versions to build deeper instrumentation, and remove old polyfills to reduce the packages' size.

### How To Upgrade

Please carefully read through the migration guide in the Sentry docs on how to upgrade from version 8 to version 9.
Make sure to select your specific platform/framework in the top left corner: https://docs.sentry.io/platforms/javascript/migration/v8-to-v9/

A comprehensive migration guide outlining all changes for all the frameworks can be found within the Sentry JavaScript SDK Repository: https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md

### Breaking Changes

- doc(deno)!: Make Deno v2 the minimum supported version (#15085)
- feat!: Bump typescript to `~5.0.0` (#14758)
- feat!: Drop `nitro-utils` package (#14998)
- feat!: Only collect ip addresses with `sendDefaultPii: true` (#15084)
- feat!: Remove `autoSessionTracking` option (#14802)
- feat!: Remove `enableTracing` (#15078)
- feat!: Remove `getCurrentHub()`, `Hub`, and `getCurrentHubShim()` (#15122)
- feat!: Remove `spanId` from propagation context (#14733)
- feat!: Remove deprecated and unused code (#15077)
- feat!: Remove metrics API from the JS SDK (#14745)
- feat!: Require Node `>=18` as minimum supported version (#14749)
- feat(astro)!: Respect user-specified source map setting (#14941)
- feat(browser)!: Remove `captureUserFeedback` method (#14820)
- feat(build)!: Drop pre-ES2020 polyfills (#14882)
- feat(core)!: Add `normalizedRequest` to `samplingContext` (#14902)
- feat(core)!: Always use session from isolation scope (#14860)
- feat(core)!: Pass root spans to `beforeSendSpan` and disallow returning `null` (#14831)
- feat(core)!: Remove `BAGGAGE_HEADER_NAME` export (#14785)
- feat(core)!: Remove `TransactionNamingScheme` type (#14865)
- feat(core)!: Remove `addOpenTelemetryInstrumentation` method (#14792)
- feat(core)!: Remove `arrayify` method (#14782)
- feat(core)!: Remove `debugIntegration` and `sessionTimingIntegration` (#14747)
- feat(core)!: Remove `flatten` method (#14784)
- feat(core)!: Remove `getDomElement` method (#14797)
- feat(core)!: Remove `makeFifoCache` method (#14786)
- feat(core)!: Remove `memoBuilder` export & `WeakSet` fallback (#14859)
- feat(core)!: Remove `transactionContext` from `samplingContext` (#14904)
- feat(core)!: Remove `urlEncode` method (#14783)
- feat(core)!: Remove deprecated `Request` type (#14858)
- feat(core)!: Remove deprecated request data methods (#14896)
- feat(core)!: Remove standalone `Client` interface & deprecate `BaseClient` (#14800)
- feat(core)!: Remove validSeverityLevels export (#14765)
- feat(core)!: Stop accepting `event` as argument for `recordDroppedEvent` (#14999)
- feat(core)!: Stop setting user in `requestDataIntegration` (#14898)
- feat(core)!: Type sdkProcessingMetadata more strictly (#14855)
- feat(core)!: Update `hasTracingEnabled` to consider empty trace config (#14857)
- feat(core)!: Update `requestDataIntegration` handling (#14806)
- feat(deno)!: Remove deno prepack (#14829)
- feat(ember)!: Officially drop support for ember `<=3.x` (#15032)
- feat(nestjs)!: Move `nestIntegration` into nest sdk and remove `setupNestErrorHandler` (#14751)
- feat(nestjs)!: Remove `@WithSentry` decorator (#14762)
- feat(nestjs)!: Remove `SentryService` (#14759)
- feat(nextjs)!: Don't rely on Next.js Build ID for release names (#14939)
- feat(nextjs)!: Remove `experimental_captureRequestError` (#14607)
- feat(nextjs)!: Respect user-provided source map generation settings (#14956)
- feat(node)!: Add support for Prisma v6 and drop v5 support (#15120)
- feat(node)!: Avoid http spans by default for custom OTEL setups (#14678)
- feat(node)!: Collect request sessions via HTTP instrumentation (#14658)
- feat(node)!: Remove `processThreadBreadcrumbIntegration` (#14666)
- feat(node)!: Remove fine grained `registerEsmLoaderHooks` (#15002)
- feat(opentelemetry)!: Exclusively pass root spans through sampling pipeline (#14951)
- feat(pinia)!: Include state of all stores in breadcrumb (#15312)
- feat(react)!: Raise minimum supported TanStack Router version to `1.63.0` (#15030)
- feat(react)!: Remove deprecated `getNumberOfUrlSegments` method (#14744)
- feat(react)!: Remove deprecated react router methods (#14743)
- feat(react)!: Update `ErrorBoundary` `componentStack` type (#14742)
- feat(remix)!: Drop support for Remix v1 (#14988)
- feat(remix)!: Remove `autoInstrumentRemix` option (#15074)
- feat(solidstart)!: Default to `--import` setup and add `autoInjectServerSentry` (#14862)
- feat(solidstart)!: No longer export `sentrySolidStartVite` (#15143)
- feat(solidstart)!: Respect user-provided source map setting (#14979)
- feat(svelte)!: Disable component update tracking by default (#15265)
- feat(sveltekit)!: Drop support for SvelteKit @1.x (#15037)
- feat(sveltekit)!: Remove `fetchProxyScriptNonce` option (#15123)
- feat(sveltekit)!: Respect user-provided source map generation settings (#14886)
- feat(utils)!: Remove `@sentry/utils` package (#14830)
- feat(vue)!: Remove configuring Vue tracing options anywhere else other than through the `vueIntegration`'s `tracingOptions` option (#14856)
- feat(vue/nuxt)!: No longer create `"update"` spans for component tracking by default (#14602)
- fix(node)!: Fix name of `vercelAIIntegration` to `VercelAI` (#15298)
- fix(vue)!: Remove `logError` from `vueIntegration` (#14958)
- ref!: Don't polyfill optional chaining and nullish coalescing (#14603)
- ref(core)!: Cleanup internal types, including `ReportDialogOptions` (#14861)
- ref(core)!: Mark exceptions from `captureConsoleIntegration` as `handled: true` by default (#14734)
- ref(core)!: Move `shutdownTimeout` option type from core to node (#15217)
- ref(core)!: Remove `Scope` type interface in favor of using `Scope` class (#14721)
- ref(core)!: Remove backwards compatible SentryCarrier type (#14697)

### Other Changes

- chore(browser): Export ipAddress helpers for use in other SDKs (#15079)
- deps(node): Bump `import-in-the-middle` to `1.12.0` (#14796)
- feat(aws): Rename AWS lambda layer name to `SentryNodeServerlessSDKv9` (#14927)
- feat(aws-serverless): Upgrade OTEL deps (#15091)
- feat(browser): Set `user.ip_address` explicitly to `{{auto}}` (#15008)
- feat(core): Add `inheritOrSampleWith` helper to `traceSampler` (#15277)
- feat(core): Emit client reports for unsampled root spans on span start (#14936)
- feat(core): Rename `hasTracingEnabled` to `hasSpansEnabled` (#15309)
- feat(core): Streamline `SpanJSON` type (#14693)
- feat(deno): Don't bundle `@sentry/deno` (#15014)
- feat(deno): Don't publish to `deno.land` (#15016)
- feat(deno): Stop inlining types from core (#14729)
- feat(deps): Bump @opentelemetry/instrumentation-amqplib from 0.45.0 to 0.46.0 (#14835)
- feat(deps): Bump @opentelemetry/instrumentation-aws-lambda from 0.49.0 to 0.50.0 (#14833)
- feat(deps): Bump @opentelemetry/instrumentation-express from 0.46.0 to 0.47.0 (#14834)
- feat(deps): Bump @opentelemetry/instrumentation-mysql2 from 0.44.0 to 0.45.0 (#14836)
- feat(deps): Bump @opentelemetry/propagation-utils from 0.30.14 to 0.30.15 (#14832)
- feat(deps): bump @opentelemetry/context-async-hooks from 1.29.0 to 1.30.0 (#14869)
- feat(deps): bump @opentelemetry/instrumentation-generic-pool from 0.42.0 to 0.43.0 (#14870)
- feat(deps): bump @opentelemetry/instrumentation-knex from 0.43.0 to 0.44.0 (#14872)
- feat(deps): bump @opentelemetry/instrumentation-mongodb from 0.50.0 to 0.51.0 (#14871)
- feat(deps): bump @opentelemetry/instrumentation-tedious from 0.17.0 to 0.18.0 (#14868)
- feat(deps): bump @sentry/cli from 2.39.1 to 2.41.1 (#15173)
- feat(flags): Add Statsig browser integration (#15319)
- feat(gatsby): Preserve user-provided source map settings (#15006)
- feat(nestjs): Remove `SentryTracingInterceptor`, `SentryGlobalGraphQLFilter`, `SentryGlobalGenericFilter` (#14761)
- feat(nextjs): Directly forward `sourcemaps.disable` to webpack plugin (#15109)
- feat(node): Add `processSessionIntegration` (#15081)
- feat(node): Add missing `vercelAIIntegration` export (#15318)
- feat(node): Capture exceptions from `worker_threads` (#15105)
- feat(nuxt): Add enabled to disable Sentry module (#15337)
- feat(nuxt): add `silent`, `errorHandler`, `release` to `SourceMapsOptions` (#15246)
- feat(profiling-node): Use `@sentry-internal/node-cpu-profiler` (#15208)
- feat(replay): Update fflate to 0.8.2 (#14867)
- feat(solidstart): Add `autoInjectServerSentry: 'experimental_dynamic-import` (#14863)
- feat(sveltekit): Only inject fetch proxy script for SvelteKit < 2.16.0 (#15126)
- feat(user feedback): Adds draw tool for UF screenshot annotations (#15062)
- feat(user feedback): Adds toolbar for cropping and annotating (#15282)
- feat: Avoid class fields all-together (#14887)
- feat: Only emit `__esModule` properties in CJS modules when there is a default export (#15018)
- feat: Pass `parentSampleRate` to `tracesSampler` (#15024)
- feat: Propagate and use a sampling random (#14989)
- fix(browser): Remove `browserPerformanceTimeOrigin` side-effects (#14025)
- fix(core): Ensure debugIds are applied to all exceptions in an event (#14881)
- fix(core): Fork scope if custom scope is passed to `startSpanManual` (#14901)
- fix(core): Fork scope if custom scope is passed to `startSpan` (#14900)
- fix(core): Only fall back to `sendDefaultPii` for IP collection in `requestDataIntegration` (#15125)
- fix(nextjs): Flush with `waitUntil` in `captureRequestError` (#15146)
- fix(nextjs): Use batched devserver symbolication endpoint (#15335)
- fix(node): Don't leak `__span` property into breadcrumbs (#14798)
- fix(node): Fix sample rand propagation for negative sampling decisions (#15045)
- fix(node): Missing `release` from ANR sessions (#15138)
- fix(node): Set the correct fallback URL fields for outgoing https requests if they are not defined (#15316)
- fix(nuxt): Detect Azure Function runtime for flushing with timeout (#15288)
- fix(react): From location can be undefined in Tanstack Router Instrumentation (#15235)
- fix(react): Import default for hoistNonReactStatics (#15238)
- fix(react): Support lazy-loaded routes and components. (#15039)
- fix(solidstart): Do not copy release-injection map file (#15302)
- ref(browser): Improve active span handling for `browserTracingIntegration` (#14959)
- ref(browser): Improve setting of propagation scope for navigation spans (#15108)
- ref(browser): Skip browser extension warning in non-debug builds (#15310)
- ref(browser): Update `supportsHistory` check & history usage (#14696)
- ref(core): Ensure non-recording root spans have frozen DSC (#14964)
- ref(core): Log debug message when capturing error events (#14701)
- ref(core): Move log message about invalid sample rate (#15215)
- ref(node): Streamline check for adding performance integrations (#15021)
- ref(react): Adapt tanstack router type (#15241)
- ref(svelte): Remove SvelteKit detection (#15313)
- ref(sveltekit): Clean up sub-request check (#15251)

Work in this release was contributed by @aloisklink, @arturovt, @aryanvdesh, @benjick, @chris-basebone, @davidturissini, @GrizliK1988, @jahands, @jrandolf, @kunal-511, @maximepvrt, @maxmaxme, @mstrokin, @nathankleyn, @nwalters512, @tannerlinsley, @tjhiggins, and @Zen-cronic. Thank you for your contributions!

## 9.0.0-alpha.2

This is an alpha release of the upcoming major release of version 9.
This release does not yet entail a comprehensive changelog as version 9 is not yet stable.

For this release's iteration of the migration guide, see the [Migration Guide as per `9.0.0-alpha.2`](https://github.com/getsentry/sentry-javascript/blob/fbedd59954d378264d11b879b6eb2a482fbc0d1b/MIGRATION.md).
Please note that the migration guide is work in progress and subject to change.

## 9.0.0-alpha.1

This is an alpha release of the upcoming major release of version 9.
This release does not yet entail a comprehensive changelog as version 9 is not yet stable.

For this release's iteration of the migration guide, see the [Migration Guide as per `9.0.0-alpha.1`](https://github.com/getsentry/sentry-javascript/blob/e4333e5ce2d65be319ee6a5a5976f7c93983a417/docs/migration/v8-to-v9.md).
Please note that the migration guide is work in progress and subject to change.

## 9.0.0-alpha.0

This is an alpha release of the upcoming major release of version 9.
This release does not yet entail a comprehensive changelog as version 9 is not yet stable.

For this release's iteration of the migration guide, see the [Migration Guide as per `9.0.0-alpha.0`](https://github.com/getsentry/sentry-javascript/blob/6e4b593adcc4ce951afa8ae0cda0605ecd226cda/docs/migration/v8-to-v9.md).
Please note that the migration guide is work in progress and subject to change.

## 8.54.0

- feat(v8/deps): Upgrade all OpenTelemetry dependencies ([#15098](https://github.com/getsentry/sentry-javascript/pull/15098))
- fix(node/v8): Add compatibility layer for Prisma v5 ([#15210](https://github.com/getsentry/sentry-javascript/pull/15210))

Work in this release was contributed by @nwalters512. Thank you for your contribution!

## 8.53.0

- feat(v8/nuxt): Add `url` to `SourcemapsUploadOptions` (#15202)
- fix(v8/react): `fromLocation` can be undefined in Tanstack Router Instrumentation (#15237)

Work in this release was contributed by @tannerlinsley. Thank you for your contribution!

## 8.52.1

- fix(v8/nextjs): Fix nextjs build warning (#15226)
- ref(v8/browser): Add protocol attributes to resource spans #15224
- ref(v8/core): Don't set `this.name` to `new.target.prototype.constructor.name` (#15222)

Work in this release was contributed by @Zen-cronic. Thank you for your contribution!

## 8.52.0

### Important Changes

- **feat(solidstart): Add `withSentry` wrapper for SolidStart config ([#15135](https://github.com/getsentry/sentry-javascript/pull/15135))**

To enable the SolidStart SDK, wrap your SolidStart Config with `withSentry`. The `sentrySolidStartVite` plugin is now automatically
added by `withSentry` and you can pass the Sentry build-time options like this:

```js
import { defineConfig } from '@solidjs/start/config';
import { withSentry } from '@sentry/solidstart';

export default defineConfig(
  withSentry(
    {
      /* Your SolidStart config options... */
    },
    {
      // Options for setting up source maps
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
    },
  ),
);
```

With the `withSentry` wrapper, the Sentry server config should not be added to the `public` directory anymore.
Add the Sentry server config in `src/instrument.server.ts`. Then, the server config will be placed inside the server build output as `instrument.server.mjs`.

Now, there are two options to set up the SDK:

1. **(recommended)** Provide an `--import` CLI flag to the start command like this (path depends on your server setup):
   `node --import ./.output/server/instrument.server.mjs .output/server/index.mjs`
2. Add `autoInjectServerSentry: 'top-level-import'` and the Sentry config will be imported at the top of the server entry (comes with tracing limitations)
   ```js
   withSentry(
     {
       /* Your SolidStart config options... */
     },
     {
       // Optional: Install Sentry with a top-level import
       autoInjectServerSentry: 'top-level-import',
     },
   );
   ```

### Other Changes

- feat(v8/core): Add client outcomes for breadcrumbs buffer ([#15149](https://github.com/getsentry/sentry-javascript/pull/15149))
- feat(v8/core): Improve error formatting in ZodErrors integration ([#15155](https://github.com/getsentry/sentry-javascript/pull/15155))
- fix(v8/bun): Ensure instrumentation of `Bun.serve` survives a server reload ([#15157](https://github.com/getsentry/sentry-javascript/pull/15157))
- fix(v8/core): Pass `module` into `loadModule` ([#15139](https://github.com/getsentry/sentry-javascript/pull/15139)) (#15166)

Work in this release was contributed by @jahands, @jrandolf, and @nathankleyn. Thank you for your contributions!

## 8.51.0

### Important Changes

- **feat(v8/node): Add `prismaInstrumentation` option to Prisma integration as escape hatch for all Prisma versions ([#15128](https://github.com/getsentry/sentry-javascript/pull/15128))**

  This release adds a compatibility API to add support for Prisma version 6.
  To capture performance data for Prisma version 6:

  1. Install the `@prisma/instrumentation` package on version 6.
  1. Pass a `new PrismaInstrumentation()` instance as exported from `@prisma/instrumentation` to the `prismaInstrumentation` option:

     ```js
     import { PrismaInstrumentation } from '@prisma/instrumentation';

     Sentry.init({
       integrations: [
         prismaIntegration({
           // Override the default instrumentation that Sentry uses
           prismaInstrumentation: new PrismaInstrumentation(),
         }),
       ],
     });
     ```

     The passed instrumentation instance will override the default instrumentation instance the integration would use, while the `prismaIntegration` will still ensure data compatibility for the various Prisma versions.

  1. Remove the `previewFeatures = ["tracing"]` option from the client generator block of your Prisma schema.

### Other Changes

- feat(v8/browser): Add `multiplexedtransport.js` CDN bundle ([#15046](https://github.com/getsentry/sentry-javascript/pull/15046))
- feat(v8/browser): Add Unleash integration ([#14948](https://github.com/getsentry/sentry-javascript/pull/14948))
- feat(v8/deno): Deprecate Deno SDK as published on deno.land ([#15121](https://github.com/getsentry/sentry-javascript/pull/15121))
- feat(v8/sveltekit): Deprecate `fetchProxyScriptNonce` option ([#15011](https://github.com/getsentry/sentry-javascript/pull/15011))
- fix(v8/aws-lambda): Avoid overwriting root span name ([#15054](https://github.com/getsentry/sentry-javascript/pull/15054))
- fix(v8/core): `fatal` events should set session as crashed ([#15073](https://github.com/getsentry/sentry-javascript/pull/15073))
- fix(v8/node/nestjs): Use method on current fastify request ([#15104](https://github.com/getsentry/sentry-javascript/pull/15104))

Work in this release was contributed by @tjhiggins, and @nwalters512. Thank you for your contributions!

## 8.50.0

- feat(v8/react): Add support for React Router `createMemoryRouter` ([#14985](https://github.com/getsentry/sentry-javascript/pull/14985))

## 8.49.0

- feat(v8/browser): Flush offline queue on flush and browser online event ([#14969](https://github.com/getsentry/sentry-javascript/pull/14969))
- feat(v8/react): Add a `handled` prop to ErrorBoundary ([#14978](https://github.com/getsentry/sentry-javascript/pull/14978))
- fix(profiling/v8): Don't put `require`, `__filename` and `__dirname` on global object ([#14952](https://github.com/getsentry/sentry-javascript/pull/14952))
- fix(v8/node): Enforce that ContextLines integration does not leave open file handles ([#14997](https://github.com/getsentry/sentry-javascript/pull/14997))
- fix(v8/replay): Disable mousemove sampling in rrweb for iOS browsers ([#14944](https://github.com/getsentry/sentry-javascript/pull/14944))
- fix(v8/sveltekit): Ensure source maps deletion is called after source ma… ([#14963](https://github.com/getsentry/sentry-javascript/pull/14963))
- fix(v8/vue): Re-throw error when no errorHandler exists ([#14943](https://github.com/getsentry/sentry-javascript/pull/14943))

Work in this release was contributed by @HHK1 and @mstrokin. Thank you for your contributions!

## 8.48.0

### Deprecations

- **feat(v8/core): Deprecate `getDomElement` method ([#14799](https://github.com/getsentry/sentry-javascript/pull/14799))**

  Deprecates `getDomElement`. There is no replacement.

### Other changes

- fix(nestjs/v8): Use correct main/module path in package.json ([#14791](https://github.com/getsentry/sentry-javascript/pull/14791))
- fix(v8/core): Use consistent `continueTrace` implementation in core ([#14819](https://github.com/getsentry/sentry-javascript/pull/14819))
- fix(v8/node): Correctly resolve debug IDs for ANR events with custom appRoot ([#14823](https://github.com/getsentry/sentry-javascript/pull/14823))
- fix(v8/node): Ensure `NODE_OPTIONS` is not passed to worker threads ([#14825](https://github.com/getsentry/sentry-javascript/pull/14825))
- fix(v8/angular): Fall back to element `tagName` when name is not provided to `TraceDirective` ([#14828](https://github.com/getsentry/sentry-javascript/pull/14828))
- fix(aws-lambda): Remove version suffix from lambda layer ([#14843](https://github.com/getsentry/sentry-javascript/pull/14843))
- fix(v8/node): Ensure express requests are properly handled ([#14851](https://github.com/getsentry/sentry-javascript/pull/14851))
- feat(v8/node): Add `openTelemetrySpanProcessors` option ([#14853](https://github.com/getsentry/sentry-javascript/pull/14853))
- fix(v8/react): Use `Set` as the `allRoutes` container. ([#14878](https://github.com/getsentry/sentry-javascript/pull/14878)) (#14884)
- fix(v8/react): Improve handling of routes nested under path="/" ([#14897](https://github.com/getsentry/sentry-javascript/pull/14897))
- feat(v8/core): Add `normalizedRequest` to `samplingContext` ([#14903](https://github.com/getsentry/sentry-javascript/pull/14903))
- fix(v8/feedback): Avoid lazy loading code for `syncFeedbackIntegration` ([#14918](https://github.com/getsentry/sentry-javascript/pull/14918))

Work in this release was contributed by @arturovt. Thank you for your contribution!

## 8.47.0

- feat(v8/core): Add `updateSpanName` helper function (#14736)
- feat(v8/node): Do not overwrite prisma `db.system` in newer Prisma versions (#14772)
- feat(v8/node/deps): Bump @prisma/instrumentation from 5.19.1 to 5.22.0 (#14755)
- feat(v8/replay): Mask srcdoc iframe contents per default (#14779)
- ref(v8/nextjs): Fix typo in source maps deletion warning (#14776)

Work in this release was contributed by @aloisklink and @benjick. Thank you for your contributions!

## 8.46.0

- feat: Allow capture of more than 1 ANR event [v8] ([#14713](https://github.com/getsentry/sentry-javascript/pull/14713))
- feat(node): Detect Railway release name [v8] ([#14714](https://github.com/getsentry/sentry-javascript/pull/14714))
- fix: Normalise ANR debug image file paths if appRoot was supplied [v8] ([#14709](https://github.com/getsentry/sentry-javascript/pull/14709))
- fix(nuxt): Remove build config from tsconfig ([#14737](https://github.com/getsentry/sentry-javascript/pull/14737))

Work in this release was contributed by @conor-ob. Thank you for your contribution!

## 8.45.1

- fix(feedback): Return when the `sendFeedback` promise resolves ([#14683](https://github.com/getsentry/sentry-javascript/pull/14683))

Work in this release was contributed by @antonis. Thank you for your contribution!

## 8.45.0

- feat(core): Add `handled` option to `captureConsoleIntegration` ([#14664](https://github.com/getsentry/sentry-javascript/pull/14664))
- feat(browser): Attach virtual stack traces to `HttpClient` events ([#14515](https://github.com/getsentry/sentry-javascript/pull/14515))
- feat(replay): Upgrade rrweb packages to 2.31.0 ([#14689](https://github.com/getsentry/sentry-javascript/pull/14689))
- fix(aws-serverless): Remove v8 layer as it overwrites the current layer for docs ([#14679](https://github.com/getsentry/sentry-javascript/pull/14679))
- fix(browser): Mark stack trace from `captureMessage` with `attachStacktrace: true` as synthetic ([#14668](https://github.com/getsentry/sentry-javascript/pull/14668))
- fix(core): Mark stack trace from `captureMessage` with `attatchStackTrace: true` as synthetic ([#14670](https://github.com/getsentry/sentry-javascript/pull/14670))
- fix(core): Set `level` in server runtime `captureException` ([#10587](https://github.com/getsentry/sentry-javascript/pull/10587))
- fix(profiling-node): Guard invocation of native profiling methods ([#14676](https://github.com/getsentry/sentry-javascript/pull/14676))
- fix(nuxt): Inline nitro-utils function ([#14680](https://github.com/getsentry/sentry-javascript/pull/14680))
- fix(profiling-node): Ensure profileId is added to transaction event ([#14681](https://github.com/getsentry/sentry-javascript/pull/14681))
- fix(react): Add React Router Descendant Routes support ([#14304](https://github.com/getsentry/sentry-javascript/pull/14304))
- fix: Disable ANR and Local Variables if debugger is enabled via CLI args ([#14643](https://github.com/getsentry/sentry-javascript/pull/14643))

Work in this release was contributed by @anonrig and @Zih0. Thank you for your contributions!

## 8.44.0

### Deprecations

- **feat: Deprecate `autoSessionTracking` ([#14640](https://github.com/getsentry/sentry-javascript/pull/14640))**

  Deprecates `autoSessionTracking`.
  To enable session tracking, it is recommended to unset `autoSessionTracking` and ensure that either, in browser environments
  the `browserSessionIntegration` is added, or in server environments the `httpIntegration` is added.

  To disable session tracking, it is recommended to unset `autoSessionTracking` and to remove the `browserSessionIntegration` in
  browser environments, or in server environments configure the `httpIntegration` with the `trackIncomingRequestsAsSessions` option set to `false`.

### Other Changes

- feat: Reword log message around unsent spans ([#14641](https://github.com/getsentry/sentry-javascript/pull/14641))
- feat(opentelemetry): Set `response` context for http.server spans ([#14634](https://github.com/getsentry/sentry-javascript/pull/14634))
- fix(google-cloud-serverless): Update homepage link in package.json ([#14411](https://github.com/getsentry/sentry-javascript/pull/14411))
- fix(nuxt): Add unbuild config to not fail on warn ([#14662](https://github.com/getsentry/sentry-javascript/pull/14662))

Work in this release was contributed by @robinvw1. Thank you for your contribution!

## 8.43.0

### Important Changes

- **feat(nuxt): Add option autoInjectServerSentry (no default import()) ([#14553](https://github.com/getsentry/sentry-javascript/pull/14553))**

  Using the dynamic `import()` as the default behavior for initializing the SDK on the server-side did not work for every project.
  The default behavior of the SDK has been changed, and you now need to **use the `--import` flag to initialize Sentry on the server-side** to leverage full functionality.

  Example with `--import`:

  ```bash
  node --import ./.output/server/sentry.server.config.mjs .output/server/index.mjs
  ```

  In case you are not able to use the `--import` flag, you can enable auto-injecting Sentry in the `nuxt.config.ts` (comes with limitations):

  ```ts
  sentry: {
    autoInjectServerSentry: 'top-level-import', // or 'experimental_dynamic-import'
  },
  ```

- **feat(browser): Adds LaunchDarkly and OpenFeature integrations ([#14207](https://github.com/getsentry/sentry-javascript/pull/14207))**

  Adds browser SDK integrations for tracking feature flag evaluations through the LaunchDarkly JS SDK and OpenFeature Web SDK:

  ```ts
  import * as Sentry from '@sentry/browser';

  Sentry.init({
    integrations: [
      // Track LaunchDarkly feature flags
      Sentry.launchDarklyIntegration(),
      // Track OpenFeature feature flags
      Sentry.openFeatureIntegration(),
    ],
  });
  ```

  - Read more about the [Feature Flags](https://develop.sentry.dev/sdk/expected-features/#feature-flags) feature in Sentry.
  - Read more about the [LaunchDarkly SDK Integration](https://docs.sentry.io/platforms/javascript/configuration/integrations/launchdarkly/).
  - Read more about the [OpenFeature SDK Integration](https://docs.sentry.io/platforms/javascript/configuration/integrations/openfeature/).

- **feat(browser): Add `featureFlagsIntegration` for custom tracking of flag evaluations ([#14582](https://github.com/getsentry/sentry-javascript/pull/14582))**

  Adds a browser integration to manually track feature flags with an API. Feature flags are attached to subsequent error events:

  ```ts
  import * as Sentry from '@sentry/browser';

  const featureFlagsIntegrationInstance = Sentry.featureFlagsIntegration();

  Sentry.init({
    // Initialize the SDK with the feature flag integration
    integrations: [featureFlagsIntegrationInstance],
  });

  // Manually track a feature flag
  featureFlagsIntegrationInstance.addFeatureFlag('my-feature', true);
  ```

- **feat(astro): Add Astro 5 support ([#14613](https://github.com/getsentry/sentry-javascript/pull/14613))**

  With this release, the Sentry Astro SDK officially supports Astro 5.

### Deprecations

- feat(nextjs): Deprecate typedef for `hideSourceMaps` ([#14594](https://github.com/getsentry/sentry-javascript/pull/14594))

  The functionality of `hideSourceMaps` was removed in version 8 but was forgotten to be deprecated and removed.
  It will be completely removed in the next major version.

- feat(core): Deprecate APIs around `RequestSession`s ([#14566](https://github.com/getsentry/sentry-javascript/pull/14566))

  The APIs around `RequestSession`s are mostly used internally.
  Going forward the SDK will not expose concepts around `RequestSession`s.
  Instead, functionality around server-side [Release Health](https://docs.sentry.io/product/releases/health/) will be managed in integrations.

### Other Changes

- feat(browser): Add `browserSessionIntegration` ([#14551](https://github.com/getsentry/sentry-javascript/pull/14551))
- feat(core): Add `raw_security` envelope types ([#14562](https://github.com/getsentry/sentry-javascript/pull/14562))
- feat(deps): Bump @opentelemetry/instrumentation from 0.55.0 to 0.56.0 ([#14625](https://github.com/getsentry/sentry-javascript/pull/14625))
- feat(deps): Bump @sentry/cli from 2.38.2 to 2.39.1 ([#14626](https://github.com/getsentry/sentry-javascript/pull/14626))
- feat(deps): Bump @sentry/rollup-plugin from 2.22.6 to 2.22.7 ([#14622](https://github.com/getsentry/sentry-javascript/pull/14622))
- feat(deps): Bump @sentry/webpack-plugin from 2.22.6 to 2.22.7 ([#14623](https://github.com/getsentry/sentry-javascript/pull/14623))
- feat(nestjs): Add fastify support ([#14549](https://github.com/getsentry/sentry-javascript/pull/14549))
- feat(node): Add @vercel/ai instrumentation ([#13892](https://github.com/getsentry/sentry-javascript/pull/13892))
- feat(node): Add `disableAnrDetectionForCallback` function ([#14359](https://github.com/getsentry/sentry-javascript/pull/14359))
- feat(node): Add `trackIncomingRequestsAsSessions` option to http integration ([#14567](https://github.com/getsentry/sentry-javascript/pull/14567))
- feat(nuxt): Add option `autoInjectServerSentry` (no default `import()`) ([#14553](https://github.com/getsentry/sentry-javascript/pull/14553))
- feat(nuxt): Add warning when Netlify or Vercel build is discovered ([#13868](https://github.com/getsentry/sentry-javascript/pull/13868))
- feat(nuxt): Improve serverless event flushing and scope isolation ([#14605](https://github.com/getsentry/sentry-javascript/pull/14605))
- feat(opentelemetry): Stop looking at propagation context for span creation ([#14481](https://github.com/getsentry/sentry-javascript/pull/14481))
- feat(opentelemetry): Update OpenTelemetry dependencies to `^1.29.0` ([#14590](https://github.com/getsentry/sentry-javascript/pull/14590))
- feat(opentelemetry): Update OpenTelemetry dependencies to `1.28.0` ([#14547](https://github.com/getsentry/sentry-javascript/pull/14547))
- feat(replay): Upgrade rrweb packages to 2.30.0 ([#14597](https://github.com/getsentry/sentry-javascript/pull/14597))
- fix(core): Decode `filename` and `module` stack frame properties in Node stack parser ([#14544](https://github.com/getsentry/sentry-javascript/pull/14544))
- fix(core): Filter out unactionable CEFSharp promise rejection error by default ([#14595](https://github.com/getsentry/sentry-javascript/pull/14595))
- fix(nextjs): Don't show warning about devtool option ([#14552](https://github.com/getsentry/sentry-javascript/pull/14552))
- fix(nextjs): Only apply tracing metadata to data fetcher data when data is an object ([#14575](https://github.com/getsentry/sentry-javascript/pull/14575))
- fix(node): Guard against invalid `maxSpanWaitDuration` values ([#14632](https://github.com/getsentry/sentry-javascript/pull/14632))
- fix(react): Match routes with `parseSearch` option in TanStack Router instrumentation ([#14328](https://github.com/getsentry/sentry-javascript/pull/14328))
- fix(sveltekit): Fix git SHA not being picked up for release ([#14540](https://github.com/getsentry/sentry-javascript/pull/14540))
- fix(types): Fix generic exports with default ([#14576](https://github.com/getsentry/sentry-javascript/pull/14576))

Work in this release was contributed by @lsmurray. Thank you for your contribution!

## 8.42.0

### Important Changes

- **feat(react): React Router v7 support (library) ([#14513](https://github.com/getsentry/sentry-javascript/pull/14513))**

  This release adds support for [React Router v7 (library mode)](https://reactrouter.com/home#react-router-as-a-library).
  Check out the docs on how to set up the integration: [Sentry React Router v7 Integration Docs](https://docs.sentry.io/platforms/javascript/guides/react/features/react-router/v7/)

### Deprecations

- **feat: Warn about source-map generation ([#14533](https://github.com/getsentry/sentry-javascript/pull/14533))**

  In the next major version of the SDK we will change how source maps are generated when the SDK is added to an application.
  Currently, the implementation varies a lot between different SDKs and can be difficult to understand.
  Moving forward, our goal is to turn on source maps for every framework, unless we detect that they are explicitly turned off.
  Additionally, if we end up enabling source maps, we will emit a log message that we did so.

  With this particular release, we are emitting warnings that source map generation will change in the future and we print instructions on how to prepare for the next major.

- **feat(nuxt): Deprecate `tracingOptions` in favor of `vueIntegration` ([#14530](https://github.com/getsentry/sentry-javascript/pull/14530))**

  Currently it is possible to configure tracing options in two places in the Sentry Nuxt SDK:

  - In `Sentry.init()`
  - Inside `tracingOptions` in `Sentry.init()`

  For tree-shaking purposes and alignment with the Vue SDK, it is now recommended to instead use the newly exported `vueIntegration()` and its `tracingOptions` option to configure tracing options in the Nuxt SDK:

  ```ts
  // sentry.client.config.ts
  import * as Sentry from '@sentry/nuxt';

  Sentry.init({
    // ...
    integrations: [
      Sentry.vueIntegration({
        tracingOptions: {
          trackComponents: true,
        },
      }),
    ],
  });
  ```

### Other Changes

- feat(browser-utils): Update `web-vitals` to v4.2.4 ([#14439](https://github.com/getsentry/sentry-javascript/pull/14439))
- feat(nuxt): Expose `vueIntegration` ([#14526](https://github.com/getsentry/sentry-javascript/pull/14526))
- fix(feedback): Handle css correctly in screenshot mode ([#14535](https://github.com/getsentry/sentry-javascript/pull/14535))

## 8.41.0

### Important Changes

- **meta(nuxt): Require minimum Nuxt v3.7.0 ([#14473](https://github.com/getsentry/sentry-javascript/pull/14473))**

  We formalized that the Nuxt SDK is at minimum compatible with Nuxt version 3.7.0 and above.
  Additionally, the SDK requires the implicit `nitropack` dependency to satisfy version `^2.10.0` and `ofetch` to satisfy `^1.4.0`.
  It is recommended to check your lock-files and manually upgrade these dependencies if they don't match the version ranges.

### Deprecations

We are deprecating a few APIs which will be removed in the next major.

The following deprecations will _potentially_ affect you:

- **feat(core): Update & deprecate `undefined` option handling ([#14450](https://github.com/getsentry/sentry-javascript/pull/14450))**

  In the next major version we will change how passing `undefined` to `tracesSampleRate` / `tracesSampler` / `enableTracing` will behave.

  Currently, doing the following:

  ```ts
  Sentry.init({
    tracesSampleRate: undefined,
  });
  ```

  Will result in tracing being _enabled_ (although no spans will be generated) because the `tracesSampleRate` key is present in the options object.
  In the next major version, this behavior will be changed so that passing `undefined` (or rather having a `tracesSampleRate` key) will result in tracing being disabled, the same as not passing the option at all.
  If you are currently relying on `undefined` being passed, and and thus have tracing enabled, it is recommended to update your config to set e.g. `tracesSampleRate: 0` instead, which will also enable tracing in v9.

  The same applies to `tracesSampler` and `enableTracing`.

- **feat(core): Log warnings when returning `null` in `beforeSendSpan` ([#14433](https://github.com/getsentry/sentry-javascript/pull/14433))**

  Currently, the `beforeSendSpan` option in `Sentry.init()` allows you to drop individual spans from a trace by returning `null` from the hook.
  Since this API lends itself to creating "gaps" inside traces, we decided to change how this API will work in the next major version.

  With the next major version the `beforeSendSpan` API can only be used to mutate spans, but no longer to drop them.
  With this release the SDK will warn you if you are using this API to drop spans.
  Instead, it is recommended to configure instrumentation (i.e. integrations) directly to control what spans are created.

  Additionally, with the next major version, root spans will also be passed to `beforeSendSpan`.

- **feat(utils): Deprecate `@sentry/utils` ([#14431](https://github.com/getsentry/sentry-javascript/pull/14431))**

  With the next major version the `@sentry/utils` package will be merged into the `@sentry/core` package.
  It is therefore no longer recommended to use the `@sentry/utils` package.

- **feat(vue): Deprecate configuring Vue tracing options anywhere else other than through the `vueIntegration`'s `tracingOptions` option ([#14385](https://github.com/getsentry/sentry-javascript/pull/14385))**

  Currently it is possible to configure tracing options in various places in the Sentry Vue SDK:

  - In `Sentry.init()`
  - Inside `tracingOptions` in `Sentry.init()`
  - In the `vueIntegration()` options
  - Inside `tracingOptions` in the `vueIntegration()` options

  Because this is a bit messy and confusing to document, the only recommended way to configure tracing options going forward is through the `tracingOptions` in the `vueIntegration()`.
  The other means of configuration will be removed in the next major version of the SDK.

- **feat: Deprecate `registerEsmLoaderHooks.include` and `registerEsmLoaderHooks.exclude` ([#14486](https://github.com/getsentry/sentry-javascript/pull/14486))**

  Currently it is possible to define `registerEsmLoaderHooks.include` and `registerEsmLoaderHooks.exclude` options in `Sentry.init()` to only apply ESM loader hooks to a subset of modules.
  This API served as an escape hatch in case certain modules are incompatible with ESM loader hooks.

  Since this API was introduced, a way was found to only wrap modules that there exists instrumentation for (meaning a vetted list).
  To only wrap modules that have instrumentation, it is recommended to instead set `registerEsmLoaderHooks.onlyIncludeInstrumentedModules` to `true`.

  Note that `onlyIncludeInstrumentedModules: true` will become the default behavior in the next major version and the `registerEsmLoaderHooks` will no longer accept fine-grained options.

The following deprecations will _most likely_ not affect you unless you are building an SDK yourself:

- feat(core): Deprecate `arrayify` ([#14405](https://github.com/getsentry/sentry-javascript/pull/14405))
- feat(core): Deprecate `flatten` ([#14454](https://github.com/getsentry/sentry-javascript/pull/14454))
- feat(core): Deprecate `urlEncode` ([#14406](https://github.com/getsentry/sentry-javascript/pull/14406))
- feat(core): Deprecate `validSeverityLevels` ([#14407](https://github.com/getsentry/sentry-javascript/pull/14407))
- feat(core/utils): Deprecate `getNumberOfUrlSegments` ([#14458](https://github.com/getsentry/sentry-javascript/pull/14458))
- feat(utils): Deprecate `memoBuilder`, `BAGGAGE_HEADER_NAME`, and `makeFifoCache` ([#14434](https://github.com/getsentry/sentry-javascript/pull/14434))
- feat(utils/core): Deprecate `addRequestDataToEvent` and `extractRequestData` ([#14430](https://github.com/getsentry/sentry-javascript/pull/14430))

### Other Changes

- feat: Streamline `sentry-trace`, `baggage` and DSC handling ([#14364](https://github.com/getsentry/sentry-javascript/pull/14364))
- feat(core): Further optimize debug ID parsing ([#14365](https://github.com/getsentry/sentry-javascript/pull/14365))
- feat(node): Add `openTelemetryInstrumentations` option ([#14484](https://github.com/getsentry/sentry-javascript/pull/14484))
- feat(nuxt): Add filter for not found source maps (devtools) ([#14437](https://github.com/getsentry/sentry-javascript/pull/14437))
- feat(nuxt): Only delete public source maps ([#14438](https://github.com/getsentry/sentry-javascript/pull/14438))
- fix(nextjs): Don't report `NEXT_REDIRECT` from browser ([#14440](https://github.com/getsentry/sentry-javascript/pull/14440))
- perf(opentelemetry): Bucket spans for cleanup ([#14154](https://github.com/getsentry/sentry-javascript/pull/14154))

Work in this release was contributed by @NEKOYASAN and @fmorett. Thank you for your contributions!

## 8.40.0

### Important Changes

- **feat(angular): Support Angular 19 ([#14398](https://github.com/getsentry/sentry-javascript/pull/14398))**

  The `@sentry/angular` SDK can now be used with Angular 19. If you're upgrading to the new Angular version, you might want to migrate from the now deprecated `APP_INITIALIZER` token to `provideAppInitializer`.
  In this case, change the Sentry `TraceService` initialization in `app.config.ts`:

  ```ts
  // Angular 18
  export const appConfig: ApplicationConfig = {
    providers: [
      // other providers
      {
        provide: TraceService,
        deps: [Router],
      },
      {
        provide: APP_INITIALIZER,
        useFactory: () => () => {},
        deps: [TraceService],
        multi: true,
      },
    ],
  };

  // Angular 19
  export const appConfig: ApplicationConfig = {
    providers: [
      // other providers
      {
        provide: TraceService,
        deps: [Router],
      },
      provideAppInitializer(() => {
        inject(TraceService);
      }),
    ],
  };
  ```

- **feat(core): Deprecate `debugIntegration` and `sessionTimingIntegration` ([#14363](https://github.com/getsentry/sentry-javascript/pull/14363))**

  The `debugIntegration` was deprecated and will be removed in the next major version of the SDK.
  To log outgoing events, use [Hook Options](https://docs.sentry.io/platforms/javascript/configuration/options/#hooks) (`beforeSend`, `beforeSendTransaction`, ...).

  The `sessionTimingIntegration` was deprecated and will be removed in the next major version of the SDK.
  To capture session durations alongside events, use [Context](https://docs.sentry.io/platforms/javascript/enriching-events/context/) (`Sentry.setContext()`).

- **feat(nestjs): Deprecate `@WithSentry` in favor of `@SentryExceptionCaptured` ([#14323](https://github.com/getsentry/sentry-javascript/pull/14323))**

  The `@WithSentry` decorator was deprecated. Use `@SentryExceptionCaptured` instead. This is a simple renaming and functionality stays identical.

- **feat(nestjs): Deprecate `SentryTracingInterceptor`, `SentryService`, `SentryGlobalGenericFilter`, `SentryGlobalGraphQLFilter` ([#14371](https://github.com/getsentry/sentry-javascript/pull/14371))**

  The `SentryTracingInterceptor` was deprecated. If you are using `@sentry/nestjs` you can safely remove any references to the `SentryTracingInterceptor`. If you are using another package migrate to `@sentry/nestjs` and remove the `SentryTracingInterceptor` afterwards.

  The `SentryService` was deprecated and its functionality was added to `Sentry.init`. If you are using `@sentry/nestjs` you can safely remove any references to the `SentryService`. If you are using another package migrate to `@sentry/nestjs` and remove the `SentryService` afterwards.

  The `SentryGlobalGenericFilter` was deprecated. Use the `SentryGlobalFilter` instead which is a drop-in replacement.

  The `SentryGlobalGraphQLFilter` was deprecated. Use the `SentryGlobalFilter` instead which is a drop-in replacement.

- **feat(node): Deprecate `nestIntegration` and `setupNestErrorHandler` in favor of using `@sentry/nestjs` ([#14374](https://github.com/getsentry/sentry-javascript/pull/14374))**

  The `nestIntegration` and `setupNestErrorHandler` functions from `@sentry/node` were deprecated and will be removed in the next major version of the SDK. If you're using `@sentry/node` in a NestJS application, we recommend switching to our new dedicated `@sentry/nestjs` package.

### Other Changes

- feat(browser): Send additional LCP timing info ([#14372](https://github.com/getsentry/sentry-javascript/pull/14372))
- feat(replay): Clear event buffer when full and in buffer mode ([#14078](https://github.com/getsentry/sentry-javascript/pull/14078))
- feat(core): Ensure `normalizedRequest` on `sdkProcessingMetadata` is merged ([#14315](https://github.com/getsentry/sentry-javascript/pull/14315))
- feat(core): Hoist everything from `@sentry/utils` into `@sentry/core` ([#14382](https://github.com/getsentry/sentry-javascript/pull/14382))
- fix(core): Do not throw when trying to fill readonly properties ([#14402](https://github.com/getsentry/sentry-javascript/pull/14402))
- fix(feedback): Fix `__self` and `__source` attributes on feedback nodes ([#14356](https://github.com/getsentry/sentry-javascript/pull/14356))
- fix(feedback): Fix non-wrapping form title ([#14355](https://github.com/getsentry/sentry-javascript/pull/14355))
- fix(nextjs): Update check for not found navigation error ([#14378](https://github.com/getsentry/sentry-javascript/pull/14378))

## 8.39.0

### Important Changes

- **feat(nestjs): Instrument event handlers ([#14307](https://github.com/getsentry/sentry-javascript/pull/14307))**

The `@sentry/nestjs` SDK will now capture performance data for [NestJS Events (`@nestjs/event-emitter`)](https://docs.nestjs.com/techniques/events)

### Other Changes

- feat(nestjs): Add alias `@SentryExceptionCaptured` for `@WithSentry` ([#14322](https://github.com/getsentry/sentry-javascript/pull/14322))
- feat(nestjs): Duplicate `SentryService` behaviour into `@sentry/nestjs` SDK `init()` ([#14321](https://github.com/getsentry/sentry-javascript/pull/14321))
- feat(nestjs): Handle GraphQL contexts in `SentryGlobalFilter` ([#14320](https://github.com/getsentry/sentry-javascript/pull/14320))
- feat(node): Add alias `childProcessIntegration` for `processThreadBreadcrumbIntegration` and deprecate it ([#14334](https://github.com/getsentry/sentry-javascript/pull/14334))
- feat(node): Ensure request bodies are reliably captured for http requests ([#13746](https://github.com/getsentry/sentry-javascript/pull/13746))
- feat(replay): Upgrade rrweb packages to 2.29.0 ([#14160](https://github.com/getsentry/sentry-javascript/pull/14160))
- fix(cdn): Ensure `_sentryModuleMetadata` is not mangled ([#14344](https://github.com/getsentry/sentry-javascript/pull/14344))
- fix(core): Set `sentry.source` attribute to `custom` when calling `span.updateName` on `SentrySpan` ([#14251](https://github.com/getsentry/sentry-javascript/pull/14251))
- fix(mongo): rewrite Buffer as ? during serialization ([#14071](https://github.com/getsentry/sentry-javascript/pull/14071))
- fix(replay): Remove replay id from DSC on expired sessions ([#14342](https://github.com/getsentry/sentry-javascript/pull/14342))
- ref(profiling) Fix electron crash ([#14216](https://github.com/getsentry/sentry-javascript/pull/14216))
- ref(types): Deprecate `Request` type in favor of `RequestEventData` ([#14317](https://github.com/getsentry/sentry-javascript/pull/14317))
- ref(utils): Stop setting `transaction` in `requestDataIntegration` ([#14306](https://github.com/getsentry/sentry-javascript/pull/14306))
- ref(vue): Reduce bundle size for starting application render span ([#14275](https://github.com/getsentry/sentry-javascript/pull/14275))

## 8.38.0

- docs: Improve docstrings for node otel integrations ([#14217](https://github.com/getsentry/sentry-javascript/pull/14217))
- feat(browser): Add moduleMetadataIntegration lazy loading support ([#13817](https://github.com/getsentry/sentry-javascript/pull/13817))
- feat(core): Add trpc path to context in trpcMiddleware ([#14218](https://github.com/getsentry/sentry-javascript/pull/14218))
- feat(deps): Bump @opentelemetry/instrumentation-amqplib from 0.42.0 to 0.43.0 ([#14230](https://github.com/getsentry/sentry-javascript/pull/14230))
- feat(deps): Bump @sentry/cli from 2.37.0 to 2.38.2 ([#14232](https://github.com/getsentry/sentry-javascript/pull/14232))
- feat(node): Add `knex` integration ([#13526](https://github.com/getsentry/sentry-javascript/pull/13526))
- feat(node): Add `tedious` integration ([#13486](https://github.com/getsentry/sentry-javascript/pull/13486))
- feat(utils): Single implementation to fetch debug ids ([#14199](https://github.com/getsentry/sentry-javascript/pull/14199))
- fix(browser): Avoid recording long animation frame spans starting before their parent span ([#14186](https://github.com/getsentry/sentry-javascript/pull/14186))
- fix(node): Include `debug_meta` with ANR events ([#14203](https://github.com/getsentry/sentry-javascript/pull/14203))
- fix(nuxt): Fix dynamic import rollup plugin to work with latest nitro ([#14243](https://github.com/getsentry/sentry-javascript/pull/14243))
- fix(react): Support wildcard routes on React Router 6 ([#14205](https://github.com/getsentry/sentry-javascript/pull/14205))
- fix(spotlight): Export spotlightBrowserIntegration from the main browser package ([#14208](https://github.com/getsentry/sentry-javascript/pull/14208))
- ref(browser): Ensure start time of interaction root and child span is aligned ([#14188](https://github.com/getsentry/sentry-javascript/pull/14188))
- ref(nextjs): Make build-time value injection turbopack compatible ([#14081](https://github.com/getsentry/sentry-javascript/pull/14081))

Work in this release was contributed by @grahamhency, @Zen-cronic, @gilisho and @phuctm97. Thank you for your contributions!

## 8.37.1

- feat(deps): Bump @opentelemetry/instrumentation from 0.53.0 to 0.54.0 for @sentry/opentelemetry ([#14187](https://github.com/getsentry/sentry-javascript/pull/14187))

## 8.37.0

### Important Changes

- **feat(nuxt): Add `piniaIntegration` ([#14138](https://github.com/getsentry/sentry-javascript/pull/14138))**

The Nuxt SDK now allows you to track Pinia state for captured errors. To enable the Pinia plugin, add the `piniaIntegration` to your client config:

```ts
// sentry.client.config.ts
import { usePinia } from '#imports';

Sentry.init({
  integrations: [
    Sentry.piniaIntegration(usePinia(), {
      /* optional Pinia plugin options */
    }),
  ],
});
```

- **feat: Deprecate metrics API ([#14157](https://github.com/getsentry/sentry-javascript/pull/14157))**

The Sentry Metrics beta has ended in favour of revisiting metrics in another form at a later date.

This new approach will include different APIs, making the current metrics API unnecessary. This release
deprecates the metrics API with the plan to remove in the next SDK major version. If you currently use the
metrics API in your code, you can safely continue to do so but sent data will no longer be processed by Sentry.

[Learn more](https://sentry.zendesk.com/hc/en-us/articles/26369339769883-Metrics-Beta-Ended-on-October-7th) about the end of the Metrics beta.

### Other Changes

- feat(browser): Add `http.response_delivery_type` attribute to resource spans ([#14056](https://github.com/getsentry/sentry-javascript/pull/14056))
- feat(browser): Add `skipBrowserExtensionCheck` escape hatch option ([#14147](https://github.com/getsentry/sentry-javascript/pull/14147))
- feat(deps): Bump @opentelemetry/instrumentation from 0.53.0 to 0.54.0 ([#14174](https://github.com/getsentry/sentry-javascript/pull/14174))
- feat(deps): Bump @opentelemetry/instrumentation-fastify from 0.40.0 to 0.41.0 ([#14175](https://github.com/getsentry/sentry-javascript/pull/14175))
- feat(deps): Bump @opentelemetry/instrumentation-graphql from 0.43.0 to 0.44.0 ([#14173](https://github.com/getsentry/sentry-javascript/pull/14173))
- feat(deps): Bump @opentelemetry/instrumentation-mongodb from 0.47.0 to 0.48.0 ([#14171](https://github.com/getsentry/sentry-javascript/pull/14171))
- feat(deps): Bump @opentelemetry/propagator-aws-xray from 1.25.1 to 1.26.0 ([#14172](https://github.com/getsentry/sentry-javascript/pull/14172))
- feat(nuxt): Add `asyncFunctionReExports` to define re-exported server functions ([#14104](https://github.com/getsentry/sentry-javascript/pull/14104))
- feat(nuxt): Add `piniaIntegration` ([#14138](https://github.com/getsentry/sentry-javascript/pull/14138))
- fix(browser): Avoid recording long task spans starting before their parent span ([#14183](https://github.com/getsentry/sentry-javascript/pull/14183))
- fix(core): Ensure errors thrown in async cron jobs bubble up ([#14182](https://github.com/getsentry/sentry-javascript/pull/14182))
- fix(core): Silently fail `maybeInstrument` ([#14140](https://github.com/getsentry/sentry-javascript/pull/14140))
- fix(nextjs): Resolve path for dynamic webpack import ([#13751](https://github.com/getsentry/sentry-javascript/pull/13751))
- fix(node): Make sure `modulesIntegration` does not crash esm apps ([#14169](https://github.com/getsentry/sentry-javascript/pull/14169))

Work in this release was contributed by @rexxars. Thank you for your contribution!

## 8.36.0

### Important Changes

- **feat(nextjs/vercel-edge/cloudflare): Switch to OTEL for performance monitoring ([#13889](https://github.com/getsentry/sentry-javascript/pull/13889))**

With this release, the Sentry Next.js, and Cloudflare SDKs will now capture performance data based on OpenTelemetry.
Some exceptions apply in cases where Next.js captures inaccurate data itself.

NOTE: You may experience minor differences in transaction names in Sentry.
Most importantly transactions for serverside pages router invocations will now be named `GET /[param]/my/route` instead of `/[param]/my/route`.
This means that those transactions are now better aligned with the OpenTelemetry semantic conventions.

### Other Changes

- deps: Bump bundler plugins and CLI to 2.22.6 and 2.37.0 respectively ([#14050](https://github.com/getsentry/sentry-javascript/pull/14050))
- feat(deps): bump @opentelemetry/instrumentation-aws-sdk from 0.44.0 to 0.45.0 ([#14099](https://github.com/getsentry/sentry-javascript/pull/14099))
- feat(deps): bump @opentelemetry/instrumentation-connect from 0.39.0 to 0.40.0 ([#14101](https://github.com/getsentry/sentry-javascript/pull/14101))
- feat(deps): bump @opentelemetry/instrumentation-express from 0.43.0 to 0.44.0 ([#14102](https://github.com/getsentry/sentry-javascript/pull/14102))
- feat(deps): bump @opentelemetry/instrumentation-fs from 0.15.0 to 0.16.0 ([#14098](https://github.com/getsentry/sentry-javascript/pull/14098))
- feat(deps): bump @opentelemetry/instrumentation-kafkajs from 0.3.0 to 0.4.0 ([#14100](https://github.com/getsentry/sentry-javascript/pull/14100))
- feat(nextjs): Add method and url to route handler request data ([#14084](https://github.com/getsentry/sentry-javascript/pull/14084))
- feat(node): Add breadcrumbs for `child_process` and `worker_thread` ([#13896](https://github.com/getsentry/sentry-javascript/pull/13896))
- fix(core): Ensure standalone spans are not sent if SDK is disabled ([#14088](https://github.com/getsentry/sentry-javascript/pull/14088))
- fix(nextjs): Await flush in api handlers ([#14023](https://github.com/getsentry/sentry-javascript/pull/14023))
- fix(nextjs): Don't leak webpack types into exports ([#14116](https://github.com/getsentry/sentry-javascript/pull/14116))
- fix(nextjs): Fix matching logic for file convention type for root level components ([#14038](https://github.com/getsentry/sentry-javascript/pull/14038))
- fix(nextjs): Respect directives in value injection loader ([#14083](https://github.com/getsentry/sentry-javascript/pull/14083))
- fix(nuxt): Only wrap `.mjs` entry files in rollup ([#14060](https://github.com/getsentry/sentry-javascript/pull/14060))
- fix(nuxt): Re-export all exported bindings ([#14086](https://github.com/getsentry/sentry-javascript/pull/14086))
- fix(nuxt): Server-side setup in readme ([#14049](https://github.com/getsentry/sentry-javascript/pull/14049))
- fix(profiling-node): Always warn when running on incompatible major version of Node.js ([#14043](https://github.com/getsentry/sentry-javascript/pull/14043))
- fix(replay): Fix `onError` callback ([#14002](https://github.com/getsentry/sentry-javascript/pull/14002))
- perf(otel): Only calculate current timestamp once ([#14094](https://github.com/getsentry/sentry-javascript/pull/14094))
- test(browser-integration): Add sentry DSN route handler by default ([#14095](https://github.com/getsentry/sentry-javascript/pull/14095))

## 8.35.0

### Beta release of the official Nuxt Sentry SDK

This release marks the beta release of the `@sentry/nuxt` Sentry SDK. For details on how to use it, check out the
[Sentry Nuxt SDK README](https://github.com/getsentry/sentry-javascript/tree/develop/packages/nuxt). Please reach out on
[GitHub](https://github.com/getsentry/sentry-javascript/issues/new/choose) if you have any feedback or concerns.

- **feat(nuxt): Make dynamic import() wrapping default
  ([#13958](https://github.com/getsentry/sentry-javascript/pull/13958))** (BREAKING)
- **feat(nuxt): Add Rollup plugin to wrap server entry with `import()`
  ([#13945](https://github.com/getsentry/sentry-javascript/pull/13945))**

**It is no longer required to add a Node `--import` flag. Please update your start command to avoid initializing Sentry
twice (BREAKING CHANGE).** The SDK will now apply modifications during the build of your application to allow for
patching of libraries during runtime. If run into issues with this change, you can disable this behavior in your
`nuxt.config.ts` and use the `--import` flag instead:

```js
sentry: {
  dynamicImportForServerEntry: false;
}
```

- **feat(nuxt): Respect user-provided source map generation settings
  ([#14020](https://github.com/getsentry/sentry-javascript/pull/14020))**

We now require you to explicitly enable sourcemaps for the clientside so that Sentry can un-minify your errors. We made
this change so source maps aren't accidentally leaked to the public. Enable source maps on the client as follows:

```js
export default defineNuxtConfig({
  sourcemap: {
    client: true,
  },
});
```

- feat(nuxt): Log server instrumentation might not work in dev
  ([#14021](https://github.com/getsentry/sentry-javascript/pull/14021))
- feat(nuxt): Add Http `responseHook` with `waitUntil`
  ([#13986](https://github.com/getsentry/sentry-javascript/pull/13986))

### Important Changes

- **feat(vue): Add Pinia plugin ([#13841](https://github.com/getsentry/sentry-javascript/pull/13841))**

Support for [Pinia](https://pinia.vuejs.org/) is added in this release for `@sentry/vue`. To capture Pinia state data,
add `createSentryPiniaPlugin()` to your Pinia store:

```javascript
import { createPinia } from 'pinia';
import { createSentryPiniaPlugin } from '@sentry/vue';

const pinia = createPinia();

pinia.use(createSentryPiniaPlugin());
```

- **feat(node): Implement Sentry-specific http instrumentation
  ([#13763](https://github.com/getsentry/sentry-javascript/pull/13763))**

This change introduces a new `SentryHttpInstrumentation` to handle non-span related HTTP instrumentation, allowing it to
run side-by-side with OTel's `HttpInstrumentation`. This improves support for custom OTel setups and avoids conflicts
with Sentry's instrumentation. Additionally, the `spans: false` option is reintroduced for `httpIntegration` to disable
span emission while still allowing custom `HttpInstrumentation` instances (`httpIntegration({ spans: false })`).

- **feat(core): Make stream instrumentation opt-in
  ([#13951](https://github.com/getsentry/sentry-javascript/pull/13951))**

This change adds a new option `trackFetchStreamPerformance` to the browser tracing integration. Only when set to `true`,
Sentry will instrument streams via fetch.

### Other Changes

- feat(node): Expose `suppressTracing` API ([#13875](https://github.com/getsentry/sentry-javascript/pull/13875))
- feat(replay): Do not log "timeout while trying to read resp body" as exception
  ([#13965](https://github.com/getsentry/sentry-javascript/pull/13965))
- chore(node): Bump `@opentelemetry/instrumentation-express` to `0.43.0`
  ([#13948](https://github.com/getsentry/sentry-javascript/pull/13948))
- chore(node): Bump `@opentelemetry/instrumentation-fastify` to `0.40.0`
  ([#13983](https://github.com/getsentry/sentry-javascript/pull/13983))
- fix: Ensure type for `init` is correct in meta frameworks
  ([#13938](https://github.com/getsentry/sentry-javascript/pull/13938))
- fix(core): `.set` the `sentry-trace` header instead of `.append`ing in fetch instrumentation
  ([#13907](https://github.com/getsentry/sentry-javascript/pull/13907))
- fix(module): keep version for node ESM package ([#13922](https://github.com/getsentry/sentry-javascript/pull/13922))
- fix(node): Ensure `ignoreOutgoingRequests` of `httpIntegration` applies to breadcrumbs
  ([#13970](https://github.com/getsentry/sentry-javascript/pull/13970))
- fix(replay): Fix onError sampling when loading an expired buffered session
  ([#13962](https://github.com/getsentry/sentry-javascript/pull/13962))
- fix(replay): Ignore older performance entries when starting manually
  ([#13969](https://github.com/getsentry/sentry-javascript/pull/13969))
- perf(node): Truncate breadcrumb messages created by console integration
  ([#14006](https://github.com/getsentry/sentry-javascript/pull/14006))

Work in this release was contributed by @ZakrepaShe and @zhiyan114. Thank you for your contributions!

## 8.34.0

### Important Changes

- **ref(nextjs): Remove dead code ([#13828](https://github.com/getsentry/sentry-javascript/pull/13903))**

Relevant for users of the `@sentry/nextjs` package: If you have previously configured a
`SENTRY_IGNORE_API_RESOLUTION_ERROR` environment variable, it is now safe to unset it.

### Other Changes

- feat(cdn): Export `getReplay` in replay CDN bundles
  ([#13881](https://github.com/getsentry/sentry-javascript/pull/13881))
- feat(replay): Clear fallback buffer when switching buffers
  ([#13914](https://github.com/getsentry/sentry-javascript/pull/13914))
- feat(replay): Upgrade rrweb packages to 2.28.0 ([#13732](https://github.com/getsentry/sentry-javascript/pull/13732))
- fix(docs): Correct supported browsers due to `globalThis`
  ([#13788](https://github.com/getsentry/sentry-javascript/pull/13788))
- fix(nextjs): Adjust path to `requestAsyncStorageShim.js` template file
  ([#13928](https://github.com/getsentry/sentry-javascript/pull/13928))
- fix(nextjs): Detect new locations for request async storage to support Next.js v15.0.0-canary.180 and higher
  ([#13920](https://github.com/getsentry/sentry-javascript/pull/13920))
- fix(nextjs): Drop `_not-found` spans for all HTTP methods
  ([#13906](https://github.com/getsentry/sentry-javascript/pull/13906))
- fix(nextjs): Fix resolution of request storage shim fallback
  ([#13929](https://github.com/getsentry/sentry-javascript/pull/13929))
- fix(node): Ensure graphql options are correct when preloading
  ([#13769](https://github.com/getsentry/sentry-javascript/pull/13769))
- fix(node): Local variables handle error ([#13827](https://github.com/getsentry/sentry-javascript/pull/13827))
- fix(node): Remove `dataloader` instrumentation from default integrations
  ([#13873](https://github.com/getsentry/sentry-javascript/pull/13873))
- fix(nuxt): Create declaration files for Nuxt module
  ([#13909](https://github.com/getsentry/sentry-javascript/pull/13909))
- fix(replay): Ensure `replay_id` is removed from frozen DSC when stopped
  ([#13893](https://github.com/getsentry/sentry-javascript/pull/13893))
- fix(replay): Try/catch `sendBufferedReplayOrFlush` to prevent cycles
  ([#13900](https://github.com/getsentry/sentry-javascript/pull/13900))
- fix(sveltekit): Ensure trace meta tags are always injected
  ([#13231](https://github.com/getsentry/sentry-javascript/pull/13231))
- fix(sveltekit): Update `wrapServerRouteWithSentry` to respect ParamMatchers
  ([#13390](https://github.com/getsentry/sentry-javascript/pull/13390))
- fix(wasm): Integration wasm uncaught WebAssembly.Exception
  ([#13787](https://github.com/getsentry/sentry-javascript/pull/13787)) (#13854)
- ref(nextjs): Ignore sentry spans based on query param attribute
  ([#13905](https://github.com/getsentry/sentry-javascript/pull/13905))
- ref(utils): Move `vercelWaitUntil` to utils ([#13891](https://github.com/getsentry/sentry-javascript/pull/13891))

Work in this release was contributed by @trzeciak, @gurpreetatwal, @ykzts and @lizhiyao. Thank you for your
contributions!

## 8.33.1

- fix(core): Update trpc middleware types ([#13859](https://github.com/getsentry/sentry-javascript/pull/13859))
- fix(fetch): Fix memory leak when handling endless streaming
  ([#13809](https://github.com/getsentry/sentry-javascript/pull/13809))

Work in this release was contributed by @soapproject. Thank you for your contribution!

## 8.33.0

### Important Changes

- **feat(nextjs): Support new async APIs (`headers()`, `params`, `searchParams`)
  ([#13828](https://github.com/getsentry/sentry-javascript/pull/13828))**

Adds support for [new dynamic Next.js APIs](https://github.com/vercel/next.js/pull/68812).

- **feat(node): Add `lru-memoizer` instrumentation
  ([#13796](https://github.com/getsentry/sentry-javascript/pull/13796))**

Adds integration for lru-memoizer using @opentelemetry/instrumentation-lru-memoizer.

- **feat(nuxt): Add `unstable_sentryBundlerPluginOptions` to module options
  ([#13811](https://github.com/getsentry/sentry-javascript/pull/13811))**

Allows passing other options from the bundler plugins (vite and rollup) to Nuxt module options.

### Other Changes

- fix(browser): Ensure `wrap()` only returns functions
  ([#13838](https://github.com/getsentry/sentry-javascript/pull/13838))
- fix(core): Adapt trpc middleware input attachment
  ([#13831](https://github.com/getsentry/sentry-javascript/pull/13831))
- fix(core): Don't return trace data in `getTraceData` and `getTraceMetaTags` if SDK is disabled
  ([#13760](https://github.com/getsentry/sentry-javascript/pull/13760))
- fix(nuxt): Don't restrict source map assets upload
  ([#13800](https://github.com/getsentry/sentry-javascript/pull/13800))
- fix(nuxt): Use absolute path for client config ([#13798](https://github.com/getsentry/sentry-javascript/pull/13798))
- fix(replay): Stop global event handling for paused replays
  ([#13815](https://github.com/getsentry/sentry-javascript/pull/13815))
- fix(sveltekit): add url param to source map upload options
  ([#13812](https://github.com/getsentry/sentry-javascript/pull/13812))
- fix(types): Add jsdocs to cron types ([#13776](https://github.com/getsentry/sentry-javascript/pull/13776))
- fix(nextjs): Loosen @sentry/nextjs webpack peer dependency
  ([#13826](https://github.com/getsentry/sentry-javascript/pull/13826))

Work in this release was contributed by @joshuajaco. Thank you for your contribution!

## 8.32.0

### Important Changes

- **ref(browser): Move navigation span descriptions into op
  ([#13527](https://github.com/getsentry/sentry-javascript/pull/13527))**

Moves the description of navigation related browser spans into the op, e.g. browser - cache -> browser.cache and sets
the description to the performanceEntry objects' names (in this context it is the URL of the page).

- **feat(node): Add amqplibIntegration ([#13714](https://github.com/getsentry/sentry-javascript/pull/13714))**

- **feat(nestjs): Add `SentryGlobalGenericFilter` and allow specifying application ref in global filter
  ([#13673](https://github.com/getsentry/sentry-javascript/pull/13673))**

Adds a `SentryGlobalGenericFilter` that filters both graphql and http exceptions depending on the context.

- **feat: Set log level for Fetch/XHR breadcrumbs based on status code
  ([#13711](https://github.com/getsentry/sentry-javascript/pull/13711))**

Sets log levels in breadcrumbs for 5xx to error and 4xx to warning.

### Other Changes

- chore(nextjs): Bump rollup to 3.29.5 ([#13761](https://github.com/getsentry/sentry-javascript/pull/13761))
- fix(core): Remove `sampled` flag from dynamic sampling context in Tracing without Performance mode
  ([#13753](https://github.com/getsentry/sentry-javascript/pull/13753))
- fix(node): Ensure node-fetch does not emit spans without tracing
  ([#13765](https://github.com/getsentry/sentry-javascript/pull/13765))
- fix(nuxt): Use Nuxt error hooks instead of errorHandler to prevent 500
  ([#13748](https://github.com/getsentry/sentry-javascript/pull/13748))
- fix(test): Unflake LCP test ([#13741](https://github.com/getsentry/sentry-javascript/pull/13741))

Work in this release was contributed by @Zen-cronic and @Sjoertjuh. Thank you for your contributions!

## 8.31.0

### Important Changes

- **feat(node): Add `dataloader` integration (#13664)**

This release adds a new integration for the [`dataloader` package](https://www.npmjs.com/package/dataloader). The Node
SDK (and all SDKs that depend on it) will now automatically instrument `dataloader` instances. You can also add it
manually:

```js
Sentry.init({
  integrations: [Sentry.dataloaderIntegration()],
});
```

### Other Changes

- feat(browser): Add navigation `activationStart` timestamp to pageload span (#13658)
- feat(gatsby): Add optional `deleteSourcemapsAfterUpload` (#13610)
- feat(nextjs): Give app router prefetch requests a `http.server.prefetch` op (#13600)
- feat(nextjs): Improve Next.js serverside span data quality (#13652)
- feat(node): Add `disableInstrumentationWarnings` option (#13693)
- feat(nuxt): Adding `experimental_basicServerTracing` option to Nuxt module (#13643)
- feat(nuxt): Improve logs about adding Node option 'import' (#13726)
- feat(replay): Add `onError` callback + other small improvements to debugging (#13721)
- feat(replay): Add experimental option to allow for a checkout every 6 minutes (#13069)
- feat(wasm): Unconditionally parse instruction addresses (#13655)
- fix: Ensure all logs are wrapped with `consoleSandbox` (#13690)
- fix(browser): Try multiple options for `lazyLoadIntegration` script parent element lookup (#13717)
- fix(feedback): Actor color applies to feedback icon (#13702)
- fix(feedback): Fix form width on mobile devices (#13068)
- fix(nestjs): Preserve original function name on `SentryTraced` functions (#13684)
- fix(node): Don't overwrite local variables for re-thrown errors (#13644)
- fix(normalize): Treat Infinity as NaN both are non-serializable numbers (#13406)
- fix(nuxt): Use correct server output file path (#13725)
- fix(opentelemetry): Always use active span in `Propagator.inject` (#13381)
- fix(replay): Fixes potential out-of-order segments (#13609)

Work in this release was contributed by @KyGuy2002, @artzhookov, and @julianCast. Thank you for your contributions!

## 8.30.0

### Important Changes

- **feat(node): Add `kafkajs` integration (#13528)**

This release adds a new integration that instruments `kafkajs` library with spans and traces. This integration is
automatically enabled by default, but can be included with the `Sentry.kafkaIntegration()` import.

```js
Sentry.init({
  integrations: [Sentry.kafkaIntegration()],
});
```

### Other Changes

- feat(core): Allow adding measurements without global client (#13612)
- feat(deps): Bump @opentelemetry/instrumentation-undici from 0.5.0 to 0.6.0 (#13622)
- feat(deps): Bump @sentry/cli from 2.33.0 to 2.35.0 (#13624)
- feat(node): Use `@opentelemetry/instrumentation-undici` for fetch tracing (#13485)
- feat(nuxt): Add server config to root folder (#13583)
- feat(otel): Upgrade @opentelemetry/semantic-conventions to 1.26.0 (#13631)
- fix(browser): check supportedEntryTypes before caling the function (#13541)
- fix(browser): Ensure Standalone CLS span timestamps are correct (#13649)
- fix(nextjs): Widen removal of 404 transactions (#13628)
- fix(node): Remove ambiguity and race conditions when matching local variables to exceptions (#13501)
- fix(node): Update OpenTelemetry instrumentation package for solidstart and opentelemetry (#13640)
- fix(node): Update OpenTelemetry instrumentation package for solidstart and opentelemetry (#13642)
- fix(vue): Ensure Vue `trackComponents` list matches components with or without `<>` (#13543)
- ref(profiling): Conditionally shim cjs globals (#13267)

Work in this release was contributed by @Zen-cronic and @odanado. Thank you for your contributions!

## 8.29.0

### Important Changes

- **Beta releases of official Solid and SolidStart Sentry SDKs**

This release marks the beta releases of the `@sentry/solid` and `@sentry/solidstart` Sentry SDKs. For details on how to
use them, check out the
[Sentry Solid SDK README](https://github.com/getsentry/sentry-javascript/tree/develop/packages/solid) and the
[Sentry SolidStart SDK README](https://github.com/getsentry/sentry-javascript/tree/develop/packages/solidstart)
respectively. Please reach out on [GitHub](https://github.com/getsentry/sentry-javascript/issues/new/choose) if you have
any feedback or concerns.

- **feat(node): Option to only wrap instrumented modules (#13139)**

Adds the SDK option to only wrap ES modules with `import-in-the-middle` that specifically need to be instrumented.

```javascript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: '__PUBLIC_DSN__',
  registerEsmLoaderHooks: { onlyIncludeInstrumentedModules: true },
});
```

- **feat(node): Update OpenTelemetry packages to instrumentation v0.53.0 (#13587)**

All internal OpenTelemetry instrumentation was updated to their latest version. This adds support for Mongoose v7 and v8
and fixes various bugs related to ESM mode.

### Other Changes

- feat(nextjs): Emit warning when using turbopack (#13566)
- feat(nextjs): Future-proof Next.js config options overriding (#13586)
- feat(node): Add `generic-pool` integration (#13465)
- feat(nuxt): Upload sourcemaps generated by Nitro (#13382)
- feat(solidstart): Add `browserTracingIntegration` by default (#13561)
- feat(solidstart): Add `sentrySolidStartVite` plugin to simplify source maps upload (#13493)
- feat(vue): Only start UI spans if parent is available (#13568)
- fix(cloudflare): Guard `context.waitUntil` call in request handler (#13549)
- fix(gatsby): Fix assets path for sourcemaps upload (#13592)
- fix(nextjs): Use posix paths for sourcemap uploads (#13603)
- fix(node-fetch): Use stringified origin url (#13581)
- fix(node): Replace dashes in `generic-pool` span origins with underscores (#13579)
- fix(replay): Fix types in WebVitalData (#13573)
- fix(replay): Improve replay web vital types (#13602)
- fix(utils): Keep logger on carrier (#13570)

Work in this release was contributed by @Zen-cronic. Thank you for your contribution!

## 8.28.0

### Important Changes

- **Beta release of official NestJS SDK**

This release contains the beta version of `@sentry/nestjs`! For details on how to use it, check out the
[README](https://github.com/getsentry/sentry-javascript/blob/master/packages/nestjs/README.md). Any feedback/bug reports
are greatly appreciated, please reach out on GitHub.

- **fix(browser): Remove faulty LCP, FCP and FP normalization logic (#13502)**

This release fixes a bug in the `@sentry/browser` package and all SDKs depending on this package (e.g. `@sentry/react`
or `@sentry/nextjs`) that caused the SDK to send incorrect web vital values for the LCP, FCP and FP vitals. The SDK
previously incorrectly processed the original values as they were reported from the browser. When updating your SDK to
this version, you might experience an increase in LCP, FCP and FP values, which potentially leads to a decrease in your
performance score in the Web Vitals Insights module in Sentry. This is because the previously reported values were
smaller than the actually measured values. We apologize for the inconvenience!

### Other Changes

- feat(nestjs): Add `SentryGlobalGraphQLFilter` (#13545)
- feat(nestjs): Automatic instrumentation of nestjs interceptors after route execution (#13264)
- feat(nextjs): Add `bundleSizeOptimizations` to build options (#13323)
- feat(nextjs): Stabilize `captureRequestError` (#13550)
- feat(nuxt): Wrap config in nuxt context (#13457)
- feat(profiling): Expose profiler as top level primitive (#13512)
- feat(replay): Add layout shift to CLS replay data (#13386)
- feat(replay): Upgrade rrweb packages to 2.26.0 (#13483)
- fix(cdn): Do not mangle \_metadata (#13426)
- fix(cdn): Fix SDK source for CDN bundles (#13475)
- fix(nestjs): Check arguments before instrumenting with `@Injectable` (#13544)
- fix(nestjs): Ensure exception and host are correctly passed on when using @WithSentry (#13564)
- fix(node): Suppress tracing for transport request execution rather than transport creation (#13491)
- fix(replay): Consider more things as DOM mutations for dead clicks (#13518)
- fix(vue): Correctly obtain component name (#13484)

Work in this release was contributed by @leopoldkristjansson, @mhuggins and @filips123. Thank you for your
contributions!

## 8.27.0

### Important Changes

- **fix(nestjs): Exception filters in main app module are not being executed (#13278)**

  With this release nestjs error monitoring is no longer automatically set up after adding the `SentryModule` to your
  application, which led to issues in certain scenarios. You will now have to either add the `SentryGlobalFilter` to
  your main module providers or decorate the `catch()` method in your existing global exception filters with the newly
  released `@WithSentry()` decorator. See the [docs](https://docs.sentry.io/platforms/javascript/guides/nestjs/) for
  more details.

### Other Changes

- feat: Add options for passing nonces to feedback integration (#13347)
- feat: Add support for SENTRY_SPOTLIGHT env var in Node (#13325)
- feat(deps): bump @prisma/instrumentation from 5.17.0 to 5.18.0 (#13327)
- feat(feedback): Improve error message for 403 errors (#13441)
- fix(deno): Don't rely on `Deno.permissions.querySync` (#13378)
- fix(replay): Ensure we publish replay CDN bundles (#13437)

Work in this release was contributed by @charpeni. Thank you for your contribution!

## 8.26.0

### Important Changes

- **feat(node): Add `fsInstrumentation` (#13291)**

  This release adds `fsIntegration`, an integration that instruments the `fs` API to the Sentry Node SDK. The
  integration creates spans with naming patterns of `fs.readFile`, `fs.unlink`, and so on.

  This integration is not enabled by default and needs to be registered in your `Sentry.init` call. You can configure
  via options whether to include path arguments or error messages as span attributes when an fs call fails:

  ```js
  Sentry.init({
    integrations: [
      Sentry.fsIntegration({
        recordFilePaths: true,
        recordErrorMessagesAsSpanAttributes: true,
      }),
    ],
  });
  ```

  **WARNING:** This integration may add significant overhead to your application. Especially in scenarios with a lot of
  file I/O, like for example when running a framework dev server, including this integration can massively slow down
  your application.

### Other Changes

- feat(browser): Add spotlightBrowser integration (#13263)
- feat(browser): Allow sentry in safari extension background page (#13209)
- feat(browser): Send CLS as standalone span (experimental) (#13056)
- feat(core): Add OpenTelemetry-specific `getTraceData` implementation (#13281)
- feat(nextjs): Always add `browserTracingIntegration` (#13324)
- feat(nextjs): Always transmit trace data to the client (#13337)
- feat(nextjs): export SentryBuildOptions (#13296)
- feat(nextjs): Update `experimental_captureRequestError` to reflect `RequestInfo.path` change in Next.js canary
  (#13344)

- feat(nuxt): Always add tracing meta tags (#13273)
- feat(nuxt): Set transaction name for server error (#13292)
- feat(replay): Add a replay-specific logger (#13256)
- feat(sveltekit): Add bundle size optimizations to plugin options (#13318)
- feat(sveltekit): Always add browserTracingIntegration (#13322)
- feat(tracing): Make long animation frames opt-out (#13255)
- fix(astro): Correctly extract request data (#13315)
- fix(astro): Only track access request headers in dynamic page requests (#13306)
- fix(nuxt): Add import line for disabled `autoImport` (#13342)
- fix(nuxt): Add vue to excludeEsmLoaderHooks array (#13346)
- fix(opentelemetry): Do not overwrite http span name if kind is internal (#13282)
- fix(remix): Ensure `origin` is correctly set for remix server spans (#13305)

Work in this release was contributed by @MonstraG, @undead-voron and @Zen-cronic. Thank you for your contributions!

## 8.25.0

### Important Changes

- **Alpha release of Official Solid Start SDK**

This release contains the alpha version of `@sentry/solidstart`, our SDK for [Solid Start](https://start.solidjs.com/)!
For details on how to use it, please see the [README](./packages/solidstart/README.md). Any feedback/bug reports are
greatly appreciated, please [reach out on GitHub](https://github.com/getsentry/sentry-javascript/issues/12538).

### Other Changes

- feat(astro): Add `bundleSizeOptimizations` vite options to integration (#13250)
- feat(astro): Always add BrowserTracing (#13244)
- feat(core): Add `getTraceMetaTags` function (#13201)
- feat(nestjs): Automatic instrumentation of nestjs exception filters (#13230)
- feat(node): Add `useOperationNameForRootSpan` to`graphqlIntegration` (#13248)
- feat(sveltekit): Add `wrapServerRouteWithSentry` wrapper (#13247)
- fix(aws-serverless): Extract sentry trace data from handler `context` over `event` (#13266)
- fix(browser): Initialize default integration if `defaultIntegrations: undefined` (#13261)
- fix(utils): Streamline IP capturing on incoming requests (#13272)

## 8.24.0

- feat(nestjs): Filter RPC exceptions (#13227)
- fix: Guard getReader function for other fetch implementations (#13246)
- fix(feedback): Ensure feedback can be lazy loaded in CDN bundles (#13241)

## 8.23.0

### Important Changes

- **feat(cloudflare): Add Cloudflare D1 instrumentation (#13142)**

This release includes support for Cloudflare D1, Cloudflare's serverless SQL database. To instrument your Cloudflare D1
database, use the `instrumentD1WithSentry` method as follows:

```ts
// env.DB is the D1 DB binding configured in your `wrangler.toml`
const db = instrumentD1WithSentry(env.DB);
// Now you can use the database as usual
await db.prepare('SELECT * FROM table WHERE id = ?').bind(1).run();
```

### Other Changes

- feat(cloudflare): Allow users to pass handler to sentryPagesPlugin (#13192)
- feat(cloudflare): Instrument scheduled handler (#13114)
- feat(core): Add `getTraceData` function (#13134)
- feat(nestjs): Automatic instrumentation of nestjs interceptors before route execution (#13153)
- feat(nestjs): Automatic instrumentation of nestjs pipes (#13137)
- feat(nuxt): Filter out Nuxt build assets (#13148)
- feat(profiling): Attach sdk info to chunks (#13145)
- feat(solidstart): Add sentry `onBeforeResponse` middleware to enable distributed tracing (#13221)
- feat(solidstart): Filter out low quality transactions for build assets (#13222)
- fix(browser): Avoid showing browser extension error message in non-`window` global scopes (#13156)
- fix(feedback): Call dialog.close() in dialog close callbacks in `\_loadAndRenderDialog` (#13203)
- fix(nestjs): Inline Observable type to resolve missing 'rxjs' dependency (#13166)
- fix(nuxt): Detect pageload by adding flag in Vue router (#13171)
- fix(utils): Handle when requests get aborted in fetch instrumentation (#13202)
- ref(browser): Improve browserMetrics collection (#13062)

Work in this release was contributed by @horochx. Thank you for your contribution!

## 8.22.0

### Important Changes

- **feat(cloudflare): Add plugin for cloudflare pages (#13123)**

This release adds support for Cloudflare Pages to `@sentry/cloudflare`, our SDK for the
[Cloudflare Workers JavaScript Runtime](https://developers.cloudflare.com/workers/)! For details on how to use it,
please see the [README](./packages/cloudflare/README.md). Any feedback/bug reports are greatly appreciated, please
[reach out on GitHub](https://github.com/getsentry/sentry-javascript/issues/12620).

```javascript
// functions/_middleware.js
import * as Sentry from '@sentry/cloudflare';

export const onRequest = Sentry.sentryPagesPlugin({
  dsn: __PUBLIC_DSN__,
  // Set tracesSampleRate to 1.0 to capture 100% of spans for tracing.
  tracesSampleRate: 1.0,
});
```

### Other Changes

- feat(meta-sdks): Remove runtime tags (#13105)
- feat(nestjs): Automatic instrumentation of nestjs guards (#13129)
- feat(nestjs): Filter all HttpExceptions (#13120)
- feat(replay): Capture exception when `internal_sdk_error` client report happens (#13072)
- fix: Use `globalThis` for code injection (#13132)

## 8.21.0

### Important Changes

- **Alpha release of Official Cloudflare SDK**
  - feat(cloudflare): Add `withSentry` method (#13025)
  - feat(cloudflare): Add cloudflare sdk scaffolding (#12953)
  - feat(cloudflare): Add basic cloudflare package and tests (#12861)

This release contains the alpha version of `@sentry/cloudflare`, our SDK for the
[Cloudflare Workers JavaScript Runtime](https://developers.cloudflare.com/workers/)! For details on how to use it,
please see the [README](./packages/cloudflare/README.md). Any feedback/bug reports are greatly appreciated, please
[reach out on GitHub](https://github.com/getsentry/sentry-javascript/issues/12620).

Please note that only Cloudflare Workers are tested and supported - official Cloudflare Pages support will come in an
upcoming release.

### Other Changes

- feat(feedback): Make cropped screenshot area draggable (#13071)
- feat(core): Adapt spans for client-side fetch to streaming responses (#12723)
- feat(core): Capture # of dropped spans through `beforeSendTransaction` (#13022)
- feat(deps): bump `@opentelemetry/instrumentation-aws-sdk` from 0.43.0 to 0.43.1 (#13089)
- feat(deps): bump `@opentelemetry/instrumentation-express` from 0.41.0 to 0.41.1 (#13090)
- feat(nestjs): Automatic instrumentation of nestjs middleware (#13065)
- feat(node): Upgrade `import-in-the-middle` to 1.11.0 (#13107)
- feat(nuxt): Add connected tracing meta tags (#13098)
- feat(nuxt): Add vue-router instrumentation (#13054)
- feat(solidstart): Add server action instrumentation helper (#13035)
- fix(feedback): Ensure pluggable feedback CDN bundle is correctly built (#13081)
- fix(nextjs): Only delete clientside bundle source maps with `sourcemaps.deleteFilesAfterUpload` (#13102)
- fix(node): Improve OTEL validation logic (#13079)

## 8.20.0

### Important Changes

- **feat(node): Allow to pass `registerEsmLoaderHooks` to preload (#12998)**

You can write your own custom preload script and configure this in the preload options. `registerEsmLoaderHooks` can be
passed as an option to `preloadOpenTelemetry`, which allows to exclude/include packages in the preload.

- **fix(node): Do not emit fetch spans when tracing is disabled (#13003)**

Sentry will not emit "fetch" spans if tracing is disabled. This is relevant for user who use their own sampler.

### Other Changes

- feat(feedback): Trigger button aria label configuration (#13008)
- feat(nestjs): Change nest sdk setup (#12920)
- feat(node): Extend ESM hooks options for iitm v1.10.0 (#13016)
- feat(node): Send client reports (#12951)
- feat(nuxt): Automatically add BrowserTracing (#13005)
- feat(nuxt): Setup source maps with vite config (#13018)
- feat(replay): Improve public Replay APIs (#13000)

## 8.19.0

- feat(core): Align Span interface with OTEL (#12898)
- fix(angular): Remove `afterSendEvent` listener once root injector is destroyed (#12786)
- fix(browser): Fix bug causing unintentional dropping of transactions (#12933)
- fix(feedback): Add a missing call of Actor.appendToDom method when DOMContentLoaded event is triggered (#12973)
- feat(vercel-edge): Add dedupe as default integration (#12957)
- fix(node): Pass inferred name & attributes to `tracesSampler` (#12945)
- feat(express): Allow to pass options to `setupExpressErrorHandler` (#12952)

Work in this release was contributed by @jaspreet57 and @arturovt. Thank you for your contribution!

## 8.18.0

### Important Changes

- **ref: Deprecate `enableTracing` (12897)**

The `enableTracing` option has been deprecated and will be removed in the next major version. We recommend removing it
in favor of the `tracesSampleRate` and `tracesSampler` options. If you want to enable performance monitoring, please set
the `tracesSampleRate` to a sample rate of your choice, or provide a sampling function as `tracesSampler` option
instead. If you want to disable performance monitoring, remove the `tracesSampler` and `tracesSampleRate` options.

### Other Changes

- feat(node): Expose `exclude` and `include` options for ESM loader (#12910)
- feat(browser): Add user agent to INP standalone span attributes (#12896)
- feat(nextjs): Add `experimental_captureRequestError` for `onRequestError` hook (#12885)
- feat(replay): Bump `rrweb` to 2.25.0 (#12478)
- feat(tracing): Add long animation frame tracing (#12646)
- fix: Cleanup hooks when they are not used anymore (#12852)
- fix(angular): Guard `ErrorEvent` check in ErrorHandler to avoid throwing in Node environments (#12892)
- fix(inp): Ensure INP spans have correct transaction (#12871)
- fix(nestjs): Do not make SentryTraced() decorated functions async (#12879)
- fix(nextjs): Support automatic instrumentation for app directory with custom page extensions (#12858)
- fix(node): Ensure correct URL is passed to `ignoreIncomingRequests` callback (#12929)
- fix(otel): Do not add `otel.kind: INTERNAL` attribute (#12841)
- fix(solidstart): Set proper sentry origin for solid router integration when used in solidstart sdk (#12919)
- fix(sveltekit): Add Vite peer dep for proper type resolution (#12926)
- fix(tracing): Ensure you can pass `null` as `parentSpan` in `startSpan*` (#12928)
- ref(core): Small bundle size improvement (#12830)

Work in this release was contributed by @GitSquared, @ziyadkhalil and @mcous. Thank you for your contributions!

## 8.17.0

- feat: Upgrade OTEL deps (#12809)
- fix(nuxt): Add module to build:transpile script (#12843)
- fix(browser): Allow SDK initialization in NW.js apps (#12846)

## 8.16.0

### Important Changes

- **feat(nextjs): Use spans generated by Next.js for App Router (#12729)**

Previously, the `@sentry/nextjs` SDK automatically recorded spans in the form of transactions for each of your top-level
server components (pages, layouts, ...). This approach had a few drawbacks, the main ones being that traces didn't have
a root span, and more importantly, if you had data stream to the client, its duration was not captured because the
server component spans had finished before the data could finish streaming.

With this release, we will capture the duration of App Router requests in their entirety as a single transaction with
server component spans being descendants of that transaction. This means you will get more data that is also more
accurate. Note that this does not apply to the Edge runtime. For the Edge runtime, the SDK will emit transactions as it
has before.

Generally speaking, this change means that you will see less _transactions_ and more _spans_ in Sentry. You will no
longer receive server component transactions like `Page Server Component (/path/to/route)` (unless using the Edge
runtime), and you will instead receive transactions for your App Router SSR requests that look like
`GET /path/to/route`.

If you are on Sentry SaaS, this may have an effect on your quota consumption: Less transactions, more spans.

- **- feat(nestjs): Add nest cron monitoring support (#12781)**

The `@sentry/nestjs` SDK now includes a `@SentryCron` decorator that can be used to augment the native NestJS `@Cron`
decorator to send check-ins to Sentry before and after each cron job run:

```typescript
import { Cron } from '@nestjs/schedule';
import { SentryCron, MonitorConfig } from '@sentry/nestjs';
import type { MonitorConfig } from '@sentry/types';

const monitorConfig: MonitorConfig = {
  schedule: {
    type: 'crontab',
    value: '* * * * *',
  },
  checkinMargin: 2, // In minutes. Optional.
  maxRuntime: 10, // In minutes. Optional.
  timezone: 'America/Los_Angeles', // Optional.
};

export class MyCronService {
  @Cron('* * * * *')
  @SentryCron('my-monitor-slug', monitorConfig)
  handleCron() {
    // Your cron job logic here
  }
}
```

### Other Changes

- feat(node): Allow to pass instrumentation config to `httpIntegration` (#12761)
- feat(nuxt): Add server error hook (#12796)
- feat(nuxt): Inject sentry config with Nuxt `addPluginTemplate` (#12760)
- fix: Apply stack frame metadata before event processors (#12799)
- fix(feedback): Add missing `h` import in `ScreenshotEditor` (#12784)
- fix(node): Ensure `autoSessionTracking` is enabled by default (#12790)
- ref(feedback): Let CropCorner inherit the existing h prop (#12814)
- ref(otel): Ensure we never swallow args for ContextManager (#12798)

## 8.15.0

- feat(core): allow unregistering callback through `on` (#11710)
- feat(nestjs): Add function-level span decorator to nestjs (#12721)
- feat(otel): Export & use `spanTimeInputToSeconds` for otel span exporter (#12699)
- fix(core): Pass origin as referrer for `lazyLoadIntegration` (#12766)
- fix(deno): Publish from build directory (#12773)
- fix(hapi): Specify error channel to filter boom errors (#12725)
- fix(react): Revert back to `jsxRuntime: 'classic'` to prevent breaking react 17 (#12775)
- fix(tracing): Report dropped spans for transactions (#12751)
- ref(scope): Delete unused public `getStack()` (#12737)

Work in this release was contributed by @arturovt and @jaulz. Thank you for your contributions!

## 8.14.0

### Important Changes

- **feat(nestjs): Filter 4xx errors (#12695)**

The `@sentry/nestjs` SDK no longer captures 4xx errors automatically.

### Other Changes

- chore(react): Remove private namespace `JSX` (#12691)
- feat(deps): bump @opentelemetry/propagator-aws-xray from 1.25.0 to 1.25.1 (#12719)
- feat(deps): bump @prisma/instrumentation from 5.16.0 to 5.16.1 (#12718)
- feat(node): Add `registerEsmLoaderHooks` option (#12684)
- feat(opentelemetry): Expose sampling helper (#12674)
- fix(browser): Make sure measure spans have valid start timestamps (#12648)
- fix(hapi): Widen type definitions (#12710)
- fix(nextjs): Attempt to ignore critical dependency warnings (#12694)
- fix(react): Fix React jsx runtime import for esm (#12740)
- fix(replay): Start replay in `afterAllSetup` instead of next tick (#12709)

Work in this release was contributed by @quisido. Thank you for your contribution!

## 8.13.0

### Important Changes

- **feat(nestjs): Add Nest SDK** This release adds a dedicated SDK for [NestJS](https://nestjs.com/) (`@sentry/nestjs`)
  in alpha state. The SDK is a drop-in replacement for the Sentry Node SDK (`@sentry/node`) supporting the same set of
  features. See the [docs](https://docs.sentry.io/platforms/javascript/guides/nestjs/) for how to use the SDK.

### Other Changes

- deps: Bump bundler plugins to `2.20.1` (#12641)
- deps(nextjs): Remove react peer dep and allow rc (#12670)
- feat: Update OTEL deps (#12635)
- feat(deps): bump @prisma/instrumentation from 5.15.0 to 5.15.1 (#12627)
- feat(node): Add context info for missing instrumentation (#12639)
- fix(feedback): Improve feedback error message (#12647)

## 8.12.0

### Important Changes

- **feat(solid): Remove need to pass router hooks to solid integration** (breaking)

This release introduces breaking changes to the `@sentry/solid` package (which is currently out in alpha).

We've made it easier to get started with the solid router integration by removing the need to pass **use\*** hooks
explicitly to `solidRouterBrowserTracingIntegration`. Import `solidRouterBrowserTracingIntegration` from
`@sentry/solid/solidrouter` and add it to `Sentry.init`

```js
import * as Sentry from '@sentry/solid';
import { solidRouterBrowserTracingIntegration, withSentryRouterRouting } from '@sentry/solid/solidrouter';
import { Router } from '@solidjs/router';

Sentry.init({
  dsn: '__PUBLIC_DSN__',
  integrations: [solidRouterBrowserTracingIntegration()],
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
});

const SentryRouter = withSentryRouterRouting(Router);
```

- **feat(core): Return client from init method (#12585)**

`Sentry.init()` now returns a client directly, so you don't need to explicitly call `getClient()` anymore:

```js
const client = Sentry.init();
```

- **feat(nextjs): Add `deleteSourcemapsAfterUpload` option (#12457)**

This adds an easy way to delete sourcemaps immediately after uploading them:

```js
module.exports = withSentryConfig(nextConfig, {
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
```

- **feat(node): Allow to configure `maxSpanWaitDuration` (#12610)**

Adds configuration option for the max. duration in seconds that the SDK will wait for parent spans to be finished before
discarding a span. The SDK will automatically clean up spans that have no finished parent after this duration. This is
necessary to prevent memory leaks in case of parent spans that are never finished or otherwise dropped/missing. However,
if you have very long-running spans in your application, a shorter duration might cause spans to be discarded too early.
In this case, you can increase this duration to a value that fits your expected data.

### Other Changes

- feat(feedback): Extra check for iPad in screenshot support (#12593)
- fix(bundle): Ensure CDN bundles do not overwrite `window.Sentry` (#12580)
- fix(feedback): Inject preact from feedbackModal into feedbackScreenshot integration (#12535)
- fix(node): Re-throw errors from koa middleware (#12609)
- fix(remix): Mark `isRemixV2` as optional in exposed types. (#12614)
- ref(node): Add error message to NodeFetch log (#12612)

Work in this release was contributed by @n4bb12. Thank you for your contribution!

## 8.11.0

### Important Changes

- **feat(core): Add `parentSpan` option to `startSpan*` APIs (#12567)**

We've made it easier to create a span as a child of a specific span via the startSpan\* APIs. This should allow you to
explicitly manage the parent-child relationship of your spans better.

```js
Sentry.startSpan({ name: 'root' }, parent => {
  const span = Sentry.startInactiveSpan({ name: 'xxx', parentSpan: parent });

  Sentry.startSpan({ name: 'xxx', parentSpan: parent }, () => {});

  Sentry.startSpanManual({ name: 'xxx', parentSpan: parent }, () => {});
});
```

### Other Changes

- feat(node): Detect release from more providers (#12529)
- fix(profiling-node): Use correct getGlobalScope import (#12564)
- fix(profiling-node) sample timestamps need to be in seconds (#12563)
- ref: Align `@sentry/node` exports from framework SDKs. (#12589)

## 8.10.0

### Important Changes

- **feat(remix): Migrate to `opentelemetry-instrumentation-remix`. (#12110)**

You can now simplify your remix instrumentation by opting-in like this:

```js
const Sentry = require('@sentry/remix');

Sentry.init({
  dsn: YOUR_DSN
  // opt-in to new auto instrumentation
  autoInstrumentRemix: true,
});
```

With this setup, you do not need to add e.g. `wrapExpressCreateRequestHandler` anymore. Additionally, the quality of the
captured data improves. The old way to use `@sentry/remix` continues to work, but it is encouraged to use the new setup.

### Other Changes

- feat(browser): Export `thirdPartyErrorFilterIntegration` from `@sentry/browser` (#12512)
- feat(feedback): Allow passing `tags` field to any feedback config param (#12197)
- feat(feedback): Improve screenshot quality for retina displays (#12487)
- feat(feedback): Screenshots don't resize after cropping (#12481)
- feat(node) add max lineno and colno limits (#12514)
- feat(profiling) add global profile context while profiler is running (#12394)
- feat(react): Add React version to events (#12390)
- feat(replay): Add url to replay hydration error breadcrumb type (#12521)
- fix(core): Ensure standalone spans respect sampled flag (#12533)
- fix(core): Use maxValueLength in extra error data integration (#12174)
- fix(feedback): Fix scrolling after feedback submission (#12499)
- fix(feedback): Send feedback rejects invalid responses (#12518)
- fix(nextjs): Update @rollup/plugin-commonjs (#12527)
- fix(node): Ensure status is correct for http server span errors (#12477)
- fix(node): Unify`getDynamicSamplingContextFromSpan` (#12522)
- fix(profiling): continuous profile chunks should be in seconds (#12532)
- fix(remix): Add nativeFetch support for accessing request headers (#12479)
- fix(remix): Export no-op as `captureRemixServerException` from client SDK (#12497)
- ref(node) refactor contextlines to use readline (#12221)

Work in this release was contributed by @AndreyKovanov and @kiliman. Thank you for your contributions!

## 8.9.2

- fix(profiling): Update exports so types generate properly (#12469)

## 8.9.1

### Important changes

- **feat(solid): Add Solid SDK**

  This release adds a dedicated SDK for [Solid JS](https://www.solidjs.com/) in alpha state with instrumentation for
  [Solid Router](https://docs.solidjs.com/solid-router) and a custom `ErrorBoundary`. See the
  [package README](https://github.com/getsentry/sentry-javascript/blob/develop/packages/solid/README.md) for how to use
  the SDK.

### Other changes

- feat(deps): bump @opentelemetry/instrumentation-express from 0.40.0 to 0.40.1 (#12438)
- feat(deps): bump @opentelemetry/instrumentation-mongodb from 0.44.0 to 0.45.0 (#12439)
- feat(deps): bump @opentelemetry/propagator-aws-xray from 1.24.1 to 1.25.0 (#12437)
- feat(nextjs): Allow for suppressing warning about missing global error handler file (#12369)
- feat(redis): Add cache logic for redis-4 (#12429)
- feat(replay): Replay Web Vital Breadcrumbs (#12296)
- fix: Fix types export order (#12404)
- fix(astro): Ensure server-side exports work correctly (#12453)
- fix(aws-serverless): Add `op` to Otel-generated lambda function root span (#12430)
- fix(aws-serverless): Only auto-patch handler in CJS when loading `awslambda-auto` (#12392)
- fix(aws-serverless): Only start root span in Sentry wrapper if Otel didn't wrap handler (#12407)
- fix(browser): Fix INP span creation & transaction tagging (#12372)
- fix(nextjs): correct types conditional export ordering (#12355)
- fix(replay): Fix guard for exception event (#12441)
- fix(vue): Handle span name assignment for nested routes in VueRouter (#12398)

Work in this release was contributed by @soch4n. Thank you for your contribution!

## 8.9.0

This release failed to publish correctly, please use `8.9.1` instead.

## 8.8.0

- **feat: Upgrade OTEL dependencies (#12388)**

This upgrades the OpenTelemetry dependencies to the latest versions and makes OTEL use `import-in-the-middle` `v1.8.0`.
This should fix numerous issues with using OTEL instrumentation with ESM.

High level issues fixed with OTEL + ESM:

- incompatibilities with using multiple loaders, commonly encountered while using `tsx` or similar libraries.
- incompatibilities with libraries that use duplicate namespace exports like `date-fns`.
- incompatibilities with libraries that use self-referencing namespace imports like `openai`.
- incompatibilities with dynamic export patterns like exports with function calls.
- `ENOENT: no such file or directory` bugs that libraries like [`discord.js`](https://github.com/discordjs/discord.js)
  surface.

If you are still encountering issues with OpenTelemetry instrumentation and ESM, please let us know.

- deps: Bump Sentry bundler plugins to version `2.18.0` (#12381)
- feat: Add `thirdPartyErrorFilterIntegration` (#12267)
- feat(core): Filter out error events with exception values and no stacktraces, values, or types (#12387)
- feat(core): Ignore additional common but inactionable errors (#12384)
- feat(deps): Bump @opentelemetry/propagator-aws-xray from 1.3.1 to 1.24.1 (#12333)
- feat(deps): Bump @sentry/cli from 2.31.2 to 2.32.1 (#12332)
- feat(redis): Support `mget` command in caching functionality (#12380)
- feat(vercel-edge): Export core integrations from Vercel edge SDK (#12308)
- fix(browser): Fix idle span ending (#12306)
- fix(browser): Fix parenthesis parsing logic for chromium (#12373)
- fix(browser): Fix types export path for CJS (#12305)
- fix(feedback): Override TriggerLabel Option (#12316)
- fix(feedback): Wait for document to be ready before doing autoinject (#12294)
- fix(nextjs): Fix memory leak (#12335)
- fix(nextjs): Fix version detection and option insertion logic for `clientTraceMetadata` option (#12323)
- fix(nextjs): Update argument name in log message about `sentry` property on Next.js config object (#12366)
- fix(node): Do not manually finish / update root Hapi spans. (#12287)
- fix(node): Fix virtual parent span ID handling & update create-next-app E2E test (#12368)
- fix(node): Skip capturing Hapi Boom responses v8. (#12288)
- fix(performance): Fix LCP not getting picked up on initial pageload transaction by setting reportAllChanges to true
  (#12360)
- fix(replay): Avoid infinite loop of logs (#12309)
- fix(replay): Ignore old events when manually starting replay (#12349)
- ref(browser): Ensure idle span ending is consistent (#12310)
- ref(profiling): unref timer (#12340)

Work in this release contributed by @dohooo, @mohd-akram, and @ykzts. Thank you for your contributions!

## 8.7.0

### Important Changes

- **feat(react): Add TanStack Router integration (#12095)**

  This release adds instrumentation for TanStack router with a new `tanstackRouterBrowserTracingIntegration` in the
  `@sentry/react` SDK:

  ```javascript
  import * as Sentry from '@sentry/react';
  import { createRouter } from '@tanstack/react-router';

  const router = createRouter({
    // Your router options...
  });

  Sentry.init({
    dsn: '___PUBLIC_DSN___',
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
    tracesSampleRate: 1.0,
  });
  ```

### Other Changes

- fix(nextjs): Do not hide `sourceMappingURL` comment on client when `nextConfig.productionBrowserSourceMaps: true` is
  set (#12278)

## 8.6.0

### Important Changes

- **feat(metrics): Add `timings` method to metrics (#12226)**

  This introduces a new method, `metrics.timing()`, which can be used in two ways:

  1. With a numeric value, to simplify creating a distribution metric. This will default to `second` as unit:

  ```js
  Sentry.metrics.timing('myMetric', 100);
  ```

  2. With a callback, which will wrap the duration of the callback. This can accept a sync or async callback. It will
     create an inactive span around the callback and at the end emit a metric with the duration of the span in seconds:

  ```js
  const returnValue = Sentry.metrics.timing('myMetric', measureThisFunction);
  ```

- **feat(react): Add `Sentry.reactErrorHandler` (#12147)**

  This PR introduces `Sentry.reactErrorHandler`, which you can use in React 19 as follows:

  ```js
  import * as Sentry from '@sentry/react';
  import { hydrateRoot } from 'react-dom/client';

  ReactDOM.hydrateRoot(
    document.getElementById('root'),
    <React.StrictMode>
      <App />
    </React.StrictMode>,
    {
      onUncaughtError: Sentry.reactErrorHandler(),
      onCaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
        // optional callback if users want custom config.
      }),
    },
  );
  ```

  For more details, take a look at [the PR](https://github.com/getsentry/sentry-javascript/pull/12147). Our
  documentation will be updated soon!

### Other Changes

- feat(sveltekit): Add request data to server-side events (#12254)
- fix(core): Pass in cron monitor config correctly (#12248)
- fix(nextjs): Don't capture suspense errors in server components (#12261)
- fix(tracing): Ensure sent spans are limited to 1000 (#12252)
- ref(core): Use versioned carrier on global object (#12206)

## 8.5.0

### Important Changes

- **feat(react): Add React 19 to peer deps (#12207)**

This release adds support for React 19 in the `@sentry/react` SDK package.

- **feat(node): Add `@sentry/node/preload` hook (#12213)**

This release adds a new way to initialize `@sentry/node`, which allows you to use the SDK with performance
instrumentation even if you cannot call `Sentry.init()` at the very start of your app.

First, run the SDK like this:

```bash
node --require @sentry/node/preload ./app.js
```

Now, you can initialize and import the rest of the SDK later or asynchronously:

```js
const express = require('express');
const Sentry = require('@sentry/node');

const dsn = await getSentryDsn();
Sentry.init({ dsn });
```

For more details, head over to the
[PR Description of the new feature](https://github.com/getsentry/sentry-javascript/pull/12213). Our docs will be updated
soon with a new guide.

### Other Changes

- feat(browser): Do not include metrics in base CDN bundle (#12230)
- feat(core): Add `startNewTrace` API (#12138)
- feat(core): Allow to pass custom scope to `captureFeedback()` (#12216)
- feat(core): Only allow `SerializedSession` in session envelope items (#11979)
- feat(nextjs): Use Vercel's `waitUntil` to defer freezing of Vercel Lambdas (#12133)
- feat(node): Ensure manual OTEL setup works (#12214)
- fix(aws-serverless): Avoid minifying `Module._resolveFilename` in Lambda layer bundle (#12232)
- fix(aws-serverless): Ensure lambda layer uses default export from `ImportInTheMiddle` (#12233)
- fix(browser): Improve browser extension error message check (#12146)
- fix(browser): Remove optional chaining in INP code (#12196)
- fix(nextjs): Don't report React postpone errors (#12194)
- fix(nextjs): Use global scope for generic event filters (#12205)
- fix(node): Add origin to redis span (#12201)
- fix(node): Change import of `@prisma/instrumentation` to use default import (#12185)
- fix(node): Only import `inspector` asynchronously (#12231)
- fix(replay): Update matcher for hydration error detection to new React docs (#12209)
- ref(profiling-node): Add warning when using non-LTS node (#12211)

## 8.4.0

### Important Changes

- **feat(nextjs): Trace pageloads in App Router (#12157)**

If you are using Next.js version `14.3.0-canary.64` or above, the Sentry Next.js SDK will now trace clientside pageloads
with React Server Components. This means, that client-side errors like
`Error: An error occurred in the Server Components render.`, which previously didn't give you much information on how
that error was caused, can now be traced back to a specific error in a server component.

- **feat(angular): Add Support for Angular 18 (#12183)**

This release guarantees support for Angular 18 with `@sentry/angular`.

### Other Changes

- feat(deps): Bump @opentelemetry/instrumentation-aws-lambda from 0.41.0 to 0.41.1 (#12078)
- fix(metrics): Ensure string values are interpreted for metrics (#12165)

## 8.3.0

### Important Changes

- **Better Node Framework Span Data**

This release improves data quality of spans emitted by Express, Fastify, Connect, Koa, Nest.js and Hapi.

- feat(node): Ensure connect spans have better data (#12130)
- feat(node): Ensure express spans have better data (#12107)
- feat(node): Ensure fastify spans have better data (#12106)
- feat(node): Ensure hapi spans have better data (#12140)
- feat(node): Ensure koa spans have better data (#12108)
- feat(node): Ensure Nest.js spans have better data (#12139)
- feat(deps): Bump @opentelemetry/instrumentation-express from 0.38.0 to 0.39.0 (#12079)

- **feat(node): No-code init via `--import=@sentry/node/init` (#11999)**

When using Sentry in ESM mode, you can now use Sentry without manually calling init like this:

```bash
 SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0 node --import=@sentry/node/init app.mjs
```

When using CommonJS, you can do:

```bash
 SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0 node --require=@sentry/node/init app.js
```

### Other Changes

- chore: Align and update MIT license dates (#12143)
- chore: Resolve or postpone a random assortment of TODOs (#11977)
- doc(migration): Add entry for runWithAsyncContext (#12153)
- docs: Add migration docs to point out that default import does not work (#12100)
- docs(sveltekit): process.env.SENTRY_AUTH_TOKEN (#12118)
- feat(browser): Ensure `browserProfilingIntegration` is published to CDN (#12158)
- feat(google-cloud): Expose ESM build (#12149)
- feat(nextjs): Ignore Prisma critical dependency warnings (#12144)
- feat(node): Add app.free_memory info to events (#12150)
- feat(node): Do not create GraphQL resolver spans by default (#12097)
- feat(node): Use `node:` prefix for node built-ins (#11895)
- feat(replay): Use unwrapped `setTimeout` to avoid e.g. angular change detection (#11924)
- fix(core): Add dsn to span envelope header (#12096)
- fix(feedback): Improve feedback border color in dark-mode, and prevent auto-dark mode when a theme is picked (#12126)
- fix(feedback): Set optionOverrides to be optional in TS definition (#12125)
- fix(nextjs): Don't put `undefined` values in props (#12131)
- fix(nextjs): Fix legacy configuration method detection for emitting warning (#12136)
- fix(node): Ensure fetch/http breadcrumbs are created correctly (#12137)
- fix(node): Update `@prisma/instrumentation` from 5.13.0 to 5.14.0 (#12081)
- ref(node): Add log for running in ESM/CommonJS mode (#12134)
- ref(node): Handle failing hook registration gracefully (#12135)
- ref(node): Only show instrumentation warning when tracing is enabled (#12141)

Work in this release contributed by @pboling. Thank you for your contribution!

## 8.2.1

- fix(aws-serverless): Fix build of lambda layer (#12083)
- fix(nestjs): Broaden nest.js type (#12076)

## 8.2.0

- feat(redis-cache): Create cache-span with prefixed keys (get/set commands) (#12070)
- feat(core): Add `beforeSendSpan` hook (#11886)
- feat(browser): Improve idle span handling (#12065)
- fix(node): Set transactionName for unsampled spans in httpIntegration (#12071)
- fix(core): Export Scope interface as `Scope` (#12067)
- fix(core): Avoid looking up client for `hasTracingEnabled()` if possible (#12066)
- fix(browser): Use consistent timestamps (#12063)
- fix(node): Fix check for performance integrations (#12043)
- ref(sveltekit): Warn to delete source maps if Sentry plugin enabled source maps generation (#12072)

## 8.1.0

This release mainly fixes a couple of bugs from the initial [8.0.0 release](#800). In addition to the changes below, we
updated some initially missed points in our migration guides and documentation.

- feat(aws-serverless): Fix tree-shaking for aws-serverless package (#12017)
- feat(node): Bump opentelemetry instrumentation to latest version (#12028)
- feat(scope): Bring back `lastEventId` on isolation scope (#11951) (#12022)
- fix(aws-serverless): Export `awslambda-auto`
- fix(node): Do not warn for missing instrumentation if SDK is disabled (#12041)
- fix(react): Set dependency-injected functions as early as possible (#12019)
- fix(react): Warn and fall back gracefully if dependency injected functions are not available (#12026)
- ref(core): Streamline `parseSampleRate` utility function (#12024)
- ref(feedback): Make `eventId` optional and use `lastEventId` in report dialog (#12029)

## 8.0.0

The Sentry JS SDK team is proud to announce the release of version `8.0.0` of Sentry's JavaScript SDKs - it's been a
long time coming! Thanks to everyone for your patience and a special shout out to the brave souls testing preview builds
and reporting issues - we appreciate your support!

---

### How to Upgrade to Version 8:

We recommend reading the
[migration guide docs](https://docs.sentry.io/platforms/javascript/migration/v7-to-v8/#migration-codemod) to find out
how to address any breaking changes in your code for your specific platform or framework.

To automate upgrading to v8 as much as possible, use our migration codemod `@sentry/migr8`:

```sh
npx @sentry/migr8@latest
```

All deprecations from the v7 cycle, with the exception of `getCurrentHub()`, have been removed and can no longer be used
in v8. If you have an advanced Sentry SDK setup, we additionally recommend reading the
[in-depth migration guide](./MIGRATION.md) in our repo which highlights all changes with additional details and
information.

The rest of this changelog highlights the most important (breaking) changes and links to more detailed information.

### Version Support

With v8, we dropped support for several old runtimes and browsers

**Node SDKs:** The Sentry JavaScript SDK v8 now supports **Node.js 14.8.0 or higher**. This applies to `@sentry/node`
and all of our node-based server-side sdks (`@sentry/nextjs`, `@sentry/remix`, etc.). Furthermore, version 8 now ships
with full support for ESM-based node apps using **Node.js 18.19.0 or higher**.

**Browser SDKs:** The browser SDKs now require
[**ES2018+**](https://caniuse.com/?feats=mdn-javascript_builtins_regexp_dotall,js-regexp-lookbehind,mdn-javascript_builtins_regexp_named_capture_groups,mdn-javascript_builtins_regexp_property_escapes,mdn-javascript_builtins_symbol_asynciterator,mdn-javascript_functions_method_definitions_async_generator_methods,mdn-javascript_grammar_template_literals_template_literal_revision,mdn-javascript_operators_destructuring_rest_in_objects,mdn-javascript_operators_destructuring_rest_in_arrays,promise-finally)
compatible browsers. New minimum browser versions:

- Chrome 71
- Edge 79
- Safari 12.1, iOS Safari 12.2
- Firefox 65
- Opera 58
- Samsung Internet 10

For more details, please see the
[version support section in our migration guide](./MIGRATION.md#1-version-support-changes).

### Initializing Server-side SDKs (Node, Bun, Deno, Serverless):

In v8, we support a lot more node-based packages than before. In order to ensure auto-instrumentation works, the SDK now
needs to be imported and initialized before any other import in your code.

We recommend creating a new file (e.g. `instrumentation.js`) to import and initialize the SDK. Then, import the file on
top of your entry file or detailed instructions, check our updated SDK setup docs
[initializing the SDK in v8](https://docs.sentry.io/platforms/javascript/guides/node/).

### Performance Monitoring Changes

The API around performance monitoring and tracing has been streamlined, and we've added support for more integrations
out of the box.

- [Performance Monitoring API](./MIGRATION.md#performance-monitoring-api)
- [Performance Monitoring Integrations](./MIGRATION.md#performance-monitoring-integrations)

### Functional Integrations

Integrations are now simple functions instead of classes. Class-based integrations
[have been removed](./MIGRATION.md#removal-of-class-based-integrations):

```javascript
// old (v7)
Sentry.init({
  integrations: [new Sentry.BrowserTracing()],
});

// new (v8)
Sentry.init({
  integrations: [Sentry.browserTracingIntegration()],
});
```

### Package removal

The following packages have been removed or replaced and will no longer be published:

- [`@sentry/hub`](./MIGRATION.md#sentryhub)
- [`@sentry/tracing`](./MIGRATION.md#sentrytracing)
- [`@sentry/integrations`](./MIGRATION.md#sentryintegrations)
- [`@sentry/serverless`](./MIGRATION.md#sentryserverless)
- [`@sentry/replay`](./MIGRATION.md#sentryreplay)

### Changes since `8.0.0-rc.3`

- **feat(nextjs): Remove `transpileClientSDK` (#11978)**

  As we are dropping support for Internet Explorer 11 and other other older browser versions wih version `8.0.0`, we are
  also removing the `transpileClientSDK` option from the Next.js SDK. If you need to support these browser versions,
  please configure Webpack and Next.js to down-compile the SDK.

- **feat(serverless): Do not include performance integrations by default (#11998)**

  To keep Lambda bundle size reasonable, the SDK no longer ships with all performance (database) integrations by
  default. Add the Sentry integrations of the databases and other tools you're using manually to your `Sentry.init` call
  by following
  [this guide](https://docs.sentry.io/platforms/javascript/configuration/integrations/#modifying-default-integrations).
  Note that this change does not apply if you use the SDK with the Sentry AWS Lambda layer.

- feat(feedback): Simplify public css configuration for feedback (#11985)
- fix(feedback): Check for empty user (#11993)
- fix(replay): Fix type for `replayCanvasIntegration` (#11995)
- fix(replay): Fix user activity not being updated in `start()` (#12001)

## 8.0.0-rc.3

### Important Changes

- **feat(bun): Add Bun Global Unhandled Handlers (#11960)**

The Bun SDK will now capture global unhandled errors.

### Other Changes

- feat(node): Log process and thread info on initialisation (#11972)
- fix(aws-serverless): Include ESM artifacts in package (#11973)
- fix(browser): Only start `http.client` spans if there is an active parent span (#11974)
- fix(feedback): Improve CSS theme variable names and layout (#11964)
- fix(node): Ensure `execArgv` are not sent to worker threads (#11963)
- ref(feedback): Simplify feedback function params (#11957)

## 8.0.0-rc.2

### Important Changes

- **feat(node): Register ESM patching hooks in init for supported Node.js versions**

This release includes adds support for ESM when `Sentry.init()` is called within a module imported via the `--import`
Node.js flag:

```sh
node --import ./your-file-with-sentry-init.mjs your-app.mjs
```

Note that the SDK only supports ESM for node versions `18.19.0` and above, and `20.6.0` above.

### Other Changes

- deps(node): Bump `@opentelemetry/core` to `1.24.1` and `@opentelemetry/instrumentation` to `0.51.1` (#11941)
- feat(connect): Warn if connect is not instrumented (#11936)
- feat(express): Warn if express is not instrumented (#11930)
- feat(fastify): Warn if fastify is not instrumented (#11917)
- feat(hapi): Warn if hapi is not instrumented (#11937)
- feat(koa): Warn if koa is not instrumented (#11931)
- fix(browser): Continuously record CLS web vital (#11934)
- fix(feedback): Pick user from any scope (#11928)
- fix(node): Fix cron instrumentation and add tests (#11811)

## 8.0.0-rc.1

This release contains no changes and was done for technical purposes. This version is considered stable.

For the sake of completeness this changelog entry includes the changes from the previous release candidate:

We recommend to read the detailed [migration guide](https://docs.sentry.io/platforms/javascript/migration/v7-to-v8/) in
the docs.

### Important Changes

- **feat(node): Support hapi v21 & fix E2E test (#11906)**

We now support hapi v21 and added tests for it.

- **feat(node): Warn if ESM mode is detected (#11914)**

When running Sentry in ESM mode, we will now warn you that this is not supported as of now. We are working on ensuring
support with ESM builds.

### Other Changes

- feat(feedback): Iterate on css for better scrolling & resizing when browser is small (#11893)
- fix(node): Ensure prisma integration creates valid DB spans (#11908)
- fix(node): Include loader hook files in package.json (#11911)

## 8.0.0-rc.0

This is the first release candidate of Sentry JavaScript SDK v8.

We recommend to read the detailed [migration guide](https://docs.sentry.io/platforms/javascript/migration/v7-to-v8/) in
the docs.

### Important Changes

- **feat(node): Support hapi v21 & fix E2E test (#11906)**

We now support hapi v21 and added tests for it.

- **feat(node): Warn if ESM mode is detected (#11914)**

When running Sentry in ESM mode, we will now warn you that this is not supported as of now. We are working on ensuring
support with ESM builds.

### Other Changes

- feat(feedback): Iterate on css for better scrolling & resizing when browser is small (#11893)
- fix(node): Ensure prisma integration creates valid DB spans (#11908)
- fix(node): Include loader hook files in package.json (#11911)

## 8.0.0-beta.6

This beta release contains various bugfixes and improvements for the v8 beta cycle.

- feat: Add `tunnel` support to multiplexed transport (#11806)
- feat: Export `spanToBaggageHeader` utility (#11881)
- feat(browser): Disable standalone `http.client` spans (#11879)
- feat(ember): Update ember dependencies (#11753)
- feat(fedback): Convert CDN bundles to use async feedback for lower bundle sizes (#11791)
- feat(feedback): Add `captureFeedback` method (#11428)
- feat(feedback): Have screenshot by default (#11839)
- feat(integrations): Add zod integration (#11144)
- feat(ioredis): Add integration for `ioredis` (#11856)
- feat(nextjs): Add transaction name to scope of server component (#11850)
- feat(nextjs): Be smarter in warning about old ways of init configuration (#11882)
- feat(nextjs): Set transaction names on scope for route handlers and generation functions (#11869)
- feat(node): Support Node 22 (#11871)
- fix(angular): Run tracing calls outside Angular (#11748)
- fix(feedback): Be consistent about whether screenshot should and can render (#11859)
- fix(nestjs): Ensure Nest.js interceptor works with non-http context (#11880)
- fix(node): Fix nest.js error handler (#11874)
- fix(react): Fix react router v4/v5 instrumentation (#11855)
- ref: Add geo location types (#11847)

## 8.0.0-beta.5

This beta release contains various bugfixes and improvements for the v8 beta cycle.

### Important Changes

- **feat(svelte): Add Svelte 5 support (#11807)**

We now officially support Svelte 5.

- **feat(browser): Send standalone fetch and XHR spans if there's no active parent span (#11783)**

Starting with this version, spans for outgoing fetch/xhr requests will be captured even if no pageload/navigation span
is ongoing. This means that you will be able to have a more complete trace, especially for web applications that make a
lot of HTTP requests on longer lived pages.

### Other Changes

- feat(astro): Add `transactionName` to isolation scope for requests (#11786)
- feat(browser): Create standalone INP spans via `startInactiveSpan` (#11788)
- feat(core): Add `trace` envelope header to span envelope (#11699)
- feat(core): Add options to start standalone (segment) spans via `start*Span` APIs (#11696)
- feat(core): Set default scope for BaseClient methods (#11775)
- feat(core): Wrap cron `withMonitor` callback in `withIsolationScope` (#11797)
- feat(feedback): New feedback button design (#11641)
- feat(nextjs): Add `transactionName` to isolation scope for Next.js server side features (#11782)
- feat(nextjs): Mute webpack warnings about critical dependencies inside `@opentelemetry/instrumentation` (#11810)
- feat(node): Upgrade @prisma/instrumentation to 5.13.0 (#11779)
- feat(react): type error as unknown in ErrorBoundary (#11819)
- feat(remix): Add `wrapHandleErrorWithSentry` (#10370)
- feat(remix): Set `formData` as `action` span data. (#10836)
- feat(remix): Update scope `transactionName` for Remix server features (#11784)
- fix(angular): Call `showReportDialog` in root context (#11703)
- fix(core): Capture only failed console.assert calls (#11799)
- fix(ember): Ensure unnecessary spans are avoided (#11846)
- fix(feedback): Clarify the difference between createWidget and create Form in the feedback public api (#11838)
- fix(feedback): Fix feedback type (#11787)
- fix(feedback): Vendor preact into bundle (#11845)
- fix(remix): Rethrow `loader`, `action` and `documentRequest` errors (#11793)
- ref: Always return an immediately generated event ID from `captureException()`, `captureMessage()`, and
  `captureEvent()` (#11805)
- ref(core): Remove transaction name extraction from `requestDataIntegration` (#11513)
- ref(svelte): Use `onlyIfParent` for recording component update spans (#11809)

## 8.0.0-beta.4

### Important Changes

- **feat(browser): Add INP support for v8 (#11650)**

INP web vital support was now forward-ported to version 8. Recording of INP data is enabled by default.

- **feat(core): Increase default transport buffer size from 30 to 64 (#11764)**

The default limit of queued events to be sent was increased from 30 to 64 events. You may observe a higher memory
footprint of the SDK. You can override this limit by setting the `transportOptions.bufferSize` option in
`Sentry.init()`.

- **feat(replay): Add "maxCanvasSize" option for replay canvases (#11617)**

A `maxCanvasSize` option was added to the `replayCanvasIntegration` to disallow capturing of canvases larger than a
certain size. This value defaults to `1280` which will not capture canvases bigger than 1280x1280 pixels.

### Other Changes

- deps: Downgrade `@opentelemetry/instrumentation-http` to `0.48.0` (#11745)
- deps(nextjs): Remove unnecessary and faulty `@opentelemetry/api` dependency from Next.js package (#11717)
- feat(aws): Add OTEL based integrations (#11548)
- feat(core): Ensure trace context only includes relevant data (#11713)
- feat(deps): Bump @opentelemetry/instrumentation-fastify from 0.33.0 to 0.35.0 (#11690)
- feat(deps): Bump @opentelemetry/instrumentation-graphql from 0.37.0 to 0.39.0 (#11692)
- feat(deps): Bump @opentelemetry/instrumentation-http from 0.48.0 to 0.50.0 (#11725)
- feat(deps): Bump @opentelemetry/instrumentation-mongoose from 0.35.0 to 0.37.0 (#11693)
- feat(deps): Bump @opentelemetry/instrumentation-mysql2 from 0.35.0 to 0.37.0 (#11726)
- feat(deps): Bump @opentelemetry/instrumentation-nestjs-core from 0.34.0 to 0.36.0 (#11727)
- feat(deps): Bump @opentelemetry/sdk-metrics from 1.21.0 to 1.23.0 (#11695)
- feat(deps): Bump @prisma/instrumentation from 5.9.0 to 5.12.1 (#11724)
- feat(feedback): Create async bundles and code to resolve helper integrations (#11621)
- feat(nextjs): Sample out low-quality spans on older Next.js versions (#11722)
- feat(opentelemetry): Support new http method attribute (#11756)
- feat(opentelemetry): Use rest args for addOpenTelemetryInstrumentation (#11721)
- feat(replay): Upgrade rrweb packages to 2.15.0 (#11736)
- fix(browser): Ensure `lazyLoadIntegration` works in NPM mode (#11673)
- fix(browser): Set custom sentry source correctly (#11735)
- fix(ember): Do not create rendering spans without transaction (#11749)
- fix(serverless): Check if cloud event callback is a function (#9044) (#11701)
- ref(nextjs): Remove unnecessary logic to filter symbolification/sentry spans (#11714)

## 8.0.0-beta.3

### Important Changes

- **feat(opentelemetry): Add `addOpenTelemetryInstrumentation` (#11667)**

A utility function `addOpenTelemetryInstrumentation` was added that allows for the registration of instrumentations that
conform to the OpenTelemetry JS API without having to specify `@opentelemetry/instrumentation` as a dependency.

- **ref(core): Don't start transaction for trpc middleware (#11697)**

Going forward, the Sentry `trpcMiddleware` will only create spans. Previously it used to always create a transaction.
This change was made to integrate more nicely with the HTTP instrumentation added in earlier versions to avoid creating
unnecessary transactions.

### Other Changes

- feat(nextjs): Instrument outgoing http requests (#11685)
- feat(opentelemetry): Remove setupGlobalHub (#11668)
- fix: Missing ErrorEvent export are added to node, browser, bun, deno, vercel-edge sub-packages (#11649)
- fix(nextjs): Do not sample next spans if they have remote parent (#11680)
- fix(nextjs): Re-enable OTEL fetch instrumentation and disable Next.js fetch instrumentation (#11686)
- fix(node): Ensure DSC on envelope header uses root span (#11683)
- ref(browser): Streamline pageload span creation and scope handling (#11679)
- ref(core): Directly use endSession (#11669)

## 8.0.0-beta.2

### Important Changes

- **feat(browser): Update `propagationContext` on `spanEnd` to keep trace consistent**

To ensure consistency throughout a route's duration, we update the scope's propagation context when the initial page
load or navigation span ends. This keeps span-specific attributes like the sampled decision and dynamic sampling context
on the scope, even after the transaction has ended.

- **fix(browser): Don't assume window.document is available (#11602)**

We won't assume `window.dodument` is available in the browser SDKs anymore. This should prevent errors in environments
where `window.document` is not available (such as web workers).

### Other changes

- feat(core): Add `server.address` to browser `http.client` spans (#11634)
- feat(opentelemetry): Update OTEL packages & relax some version ranges (#11580)
- feat(deps): bump @opentelemetry/instrumentation-hapi from 0.34.0 to 0.36.0 (#11496)
- feat(deps): bump @opentelemetry/instrumentation-koa from 0.37.0 to 0.39.0 (#11495)
- feat(deps): bump @opentelemetry/instrumentation-pg from 0.38.0 to 0.40.0 (#11494)
- feat(nextjs): Skip OTEL root spans emitted by Next.js (#11623)
- feat(node): Collect Local Variables via a worker (#11586)
- fix(nextjs): Escape Next.js' OpenTelemetry instrumentation (#11625)
- fix(feedback): Fix timeout on feedback submission (#11619)
- fix(node): Allow use of `NodeClient` without calling `init` (#11585)
- fix(node): Ensure DSC is correctly set in envelope headers (#11628)

## 8.0.0-beta.1

This is the first beta release of Sentry JavaScript SDK v8. With this release, there are no more planned breaking
changes for the v8 cycle.

Read the [in-depth migration guide](./MIGRATION.md) to find out how to address any breaking changes in your code. All
deprecations from the v7 cycle, with the exception of `getCurrentHub()`, have been removed and can no longer be used in
v8.

### Version Support

The Sentry JavaScript SDK v8 now supports Node.js 14.8.0 or higher. This applies to `@sentry/node` and all of our
node-based server-side sdks (`@sentry/nextjs`, `@sentry/remix`, etc.).

The browser SDKs now require
[ES2018+](https://caniuse.com/?feats=mdn-javascript_builtins_regexp_dotall,js-regexp-lookbehind,mdn-javascript_builtins_regexp_named_capture_groups,mdn-javascript_builtins_regexp_property_escapes,mdn-javascript_builtins_symbol_asynciterator,mdn-javascript_functions_method_definitions_async_generator_methods,mdn-javascript_grammar_template_literals_template_literal_revision,mdn-javascript_operators_destructuring_rest_in_objects,mdn-javascript_operators_destructuring_rest_in_arrays,promise-finally)
compatible browsers. New minimum browser versions:

- Chrome 63
- Edge 79
- Safari/iOS Safari 12
- Firefox 58
- Opera 50
- Samsung Internet 8.2

For more details, please see the [version support section in migration guide](./MIGRATION.md#1-version-support-changes).

### Package removal

The following packages will no longer be published

- [@sentry/hub](./MIGRATION.md#sentryhub)
- [@sentry/tracing](./MIGRATION.md#sentrytracing)
- [@sentry/integrations](./MIGRATION.md#sentryintegrations)
- [@sentry/serverless](./MIGRATION.md#sentryserverless)
- [@sentry/replay](./MIGRATION.md#sentryreplay)

### Initializing Server-side SDKs (Node, Bun, Next.js, SvelteKit, Astro, Remix):

Initializing the SDKs on the server-side has been simplified. More details in our migration docs about
[initializing the SDK in v8](./MIGRATION.md/#initializing-the-node-sdk).

### Performance Monitoring Changes

The API around performance monitoring and tracing has been vastly improved, and we've added support for more
integrations out of the box.

- [Performance Monitoring API](./MIGRATION.md#performance-monitoring-api)
- [Performance Monitoring Integrations](./MIGRATION.md#performance-monitoring-integrations)

### Important Changes since v8.0.0-alpha.9

- **feat(browser): Create spans as children of root span by default (#10986)**

Because execution context isolation in browser environments does not work reliably, we deciced to keep a flat span
hierarchy by default in v8.

- **feat(core): Deprecate `addTracingExtensions` (#11579)**

Instead of calling `Sentry.addTracingExtensions()` if you want to use performance in a browser SDK without using
`browserTracingIntegration()`, you should now call `Sentry.registerSpanErrorInstrumentation()`.

- **feat(core): Implement `suppressTracing` (#11468)**

You can use the new `suppressTracing` API to ensure a given callback will not generate any spans:

```js
return Sentry.suppressTracing(() => {
  // Ensure this fetch call does not generate a span
  return fetch('/my-url');
});
```

- **feat: Rename ESM loader hooks to `import` and `loader` (#11498)**

We renamed the loader hooks for better clarity:

```sh
# For Node.js <= 18.18.2
node --loader=@sentry/node/loader app.js

# For Node.js >= 18.19.0
node --import=@sentry/node/import app.js
```

- **feat(node): Do not exit process by default when other `onUncaughtException` handlers are registered in
  `onUncaughtExceptionIntegration` (#11532)**

In v8, we will no longer exit the node process by default if other uncaught exception handlers have been registered by
the user.

- **Better handling of transaction name for errors**

We improved the way we keep the transaction name for error events, even when spans are not sampled or performance is
disabled.

- feat(fastify): Update scope `transactionName` when handling request (#11447)
- feat(hapi): Update scope `transactionName` when handling request (#11448)
- feat(koa): Update scope `transactionName` when creating router span (#11476)
- feat(sveltekit): Update scope transactionName when handling server-side request (#11511)
- feat(nestjs): Update scope transaction name with parameterized route (#11510)

### Removal/Refactoring of deprecated functionality

- feat(core): Remove `getCurrentHub` from `AsyncContextStrategy` (#11581)
- feat(core): Remove `getGlobalHub` export (#11565)
- feat(core): Remove `Hub` class export (#11560)
- feat(core): Remove most Hub class exports (#11536)
- feat(nextjs): Remove webpack 4 support (#11605)
- feat(vercel-edge): Stop using hub (#11539)

### Other Changes

- feat: Hoist `getCurrentHub` shim to core as `getCurrentHubShim` (#11537)
- feat(core): Add default behaviour for `rewriteFramesIntegration` in browser (#11535)
- feat(core): Ensure replay envelopes are sent in order when offline (#11413)
- feat(core): Extract errors from props in unkown inputs (#11526)
- feat(core): Update metric normalization (#11518)
- feat(feedback): Customize feedback placeholder text color (#11417)
- feat(feedback): Maintain v7 compat in the @sentry-internal/feedback package (#11461)
- feat(next): Handle existing root spans for isolation scope (#11479)
- feat(node): Ensure tracing without performance (TWP) works (#11564)
- feat(opentelemetry): Export `getRequestSpanData` (#11508)
- feat(opentelemetry): Remove otel.attributes in context (#11604)
- feat(ratelimit): Add metrics rate limit (#11538)
- feat(remix): Skip span creation for `OPTIONS` and `HEAD` requests. (#11149)
- feat(replay): Merge packages together & ensure bundles are built (#11552)
- feat(tracing): Adds span envelope and datacategory (#11534)
- fix(browser): Ensure pageload trace remains active after pageload span finished (#11600)
- fix(browser): Ensure tracing without performance (TWP) works (#11561)
- fix(nextjs): Fix `tunnelRoute` matching logic for hybrid cloud (#11576)
- fix(nextjs): Remove Http integration from Next.js (#11304)
- fix(node): Ensure isolation scope is correctly cloned for non-recording spans (#11503)
- fix(node): Make fastify types more broad (#11544)
- fix(node): Send ANR events without scope if event loop blocked indefinitely (#11578)
- fix(tracing): Fixes latest route name and source not updating correctly (#11533)
- ref(browser): Move browserTracing into browser pkg (#11484)
- ref(feedback): Configure font size (#11437)
- ref(feedback): Refactor Feedback types into @sentry/types and reduce the exported surface area (#11355)

## 8.0.0-beta.0

This release failed to publish correctly. Use 8.0.0-beta.1 instead.

## 8.0.0-alpha.9

This is the eighth alpha release of Sentry JavaScript SDK v8, which includes a variety of breaking changes.

Read the [in-depth migration guide](./MIGRATION.md) to find out how to address any breaking changes in your code.

### Important Changes

- **feat: Add @sentry-internal/browser-utils (#11381)**

A big part of the browser-runtime specific exports of the internal `@sentry/utils` package were moved into a new package
`@sentry-internal/browser-utils`. If you imported any API from `@sentry/utils` (which is generally not recommended but
necessary for some workarounds), please check that your import statements still point to existing exports after
upgrading.

- **feat: Add loader file to node-based SDKs to support ESM monkeypatching (#11338)**

When using ESM, it is necessary to use a "loader" to be able to instrument certain third-party packages and Node.js API.
The server-side SDKs now ship with a set of ESM loader hooks, that should be used when using ESM. Use them as follows:

```sh
# For Node.js <= 18.18.2
node --experimental-loader=@sentry/node/hook your-app.js

# For Node.js >= 18.19.0
node --import=@sentry/node/register your-app.js
```

Please note that due to an upstream bug, these loader hooks will currently crash or simply not work. We are planning to
fix this in upcoming versions of the SDK - definitely before a stable version 8 release.

- **feat(node): Add Koa error handler (#11403)**
- **feat(node): Add NestJS error handler (#11375)**

The Sentry SDK now exports integrations and error middlewares for Koa (`koaIntegration()`, `setupKoaErrorHandler()`) and
NestJS (`setupNestErrorHandler()`) that can be used to instrument your Koa and NestJS applications with error
monitoring.

### Removal/Refactoring of deprecated functionality

- feat(core): Remove hub check in isSentryRequestUrl (#11407)
- feat(opentelemetry): Remove top level startActiveSpan (#11380)
- feat(types): `beforeSend` and `beforeSendTransaction` breaking changes (#11354)
- feat(v8): Remove all class based integrations (#11345)
- feat(v8/core): Remove span.attributes top level field (#11378)
- ref: Remove convertIntegrationFnToClass (#11343)
- ref(node): Remove the old `node` package (#11322)
- ref(tracing): Remove `span.startChild()` (#11376)
- ref(v8): Remove `addRequestDataToTransaction` util (#11369)
- ref(v8): Remove `args` on `HandlerDataXhr` (#11373)
- ref(v8): Remove `getGlobalObject` utility method (#11372)
- ref(v8): Remove `metadata` on transaction (#11397)
- ref(v8): Remove `pushScope`, `popScope`, `isOlderThan`, `shouldSendDefaultPii` from hub (#11404)
- ref(v8): Remove `shouldCreateSpanForRequest` from vercel edge options (#11371)
- ref(v8): Remove deprecated `_reportAllChanges` option (#11393)
- ref(v8): Remove deprecated `scope.getTransaction()` (#11365)
- ref(v8): Remove deprecated methods on scope (#11366)
- ref(v8): Remove deprecated span & transaction properties (#11400)
- ref(v8): Remove Transaction concept (#11422)

### Other Changes

- feat: Add `trpcMiddleware` back to serverside SDKs (#11374)
- feat: Implement timed events & remove `transaction.measurements` (#11398)
- feat(browser): Bump web-vitals to 3.5.2 (#11391)
- feat(feedback): Add `getFeedback` utility to get typed feedback instance (#11331)
- feat(otel): Do not sample `options` and `head` requests (#11467)
- feat(remix): Update scope `transactionName` when resolving route (#11420)
- feat(replay): Bump `rrweb` to 2.12.0 (#11314)
- feat(replay): Use data sentry element as fallback for the component name (#11383)
- feat(sveltekit): Update scope `transactionName` when pageload route name is updated (#11406)
- feat(tracing-internal): Reset propagation context on navigation (#11401)
- feat(types): Add View Hierarchy types (#11409)
- feat(utils): Use `globalThis` (#11351)
- feat(vue): Update scope's `transactionName` when resolving a route (#11423)
- fix(core): unref timer to not block node exit (#11430)
- fix(node): Fix baggage propagation (#11363)
- fix(web-vitals): Check for undefined navigation entry (#11311)
- ref: Set preserveModules to true for browser packages (#11452)
- ref(core): Remove duplicate logic in scope.update (#11384)
- ref(feedback): Add font family style to actor (#11432)
- ref(feedback): Add font family to buttons (#11414)
- ref(gcp-serverless): Remove setting `.__sentry_transaction` (#11346)
- ref(nextjs): Replace multiplexer with conditional exports (#11442)

## 8.0.0-alpha.8

This is a partially broken release and was superseded by version `8.0.0-alpha.9`.

## 8.0.0-alpha.7

This is the seventh alpha release of Sentry JavaScript SDK v8, which includes a variety of breaking changes.

Read the [in-depth migration guide](./MIGRATION.md) to find out how to address any breaking changes in your code.

### Important Changes

- **feat(nextjs): Use OpenTelemetry for performance monitoring and tracing (#11016)**

We now use OpenTelemetry under the hood to power performance monitoring and tracing in the Next.js SDK.

- **feat(v8/gatsby): Update SDK initialization for gatsby (#11292)**

In v8, you cannot initialize the SDK anymore via Gatsby plugin options. Instead, you have to configure the SDK in a
`sentry.config.js` file.

We also removed the automatic initialization of `browserTracingIntegration`. You now have to add this integration
yourself.

### Removal/Refactoring of deprecated functionality

- feat(v8): Remove addGlobalEventProcessor (#11255)
- feat(v8): Remove deprecated span id fields (#11180)
- feat(v8): Remove makeMain export (#11278)
- feat(v8/core): Remove deprecated span.sampled (#11274)
- feat(v8/core): Remove getActiveTransaction (#11280)
- feat(v8/core): Remove spanMetadata field (#11271)
- feat(v8/ember): Remove deprecated StartTransactionFunction (#11270)
- feat(v8/replay): Remove deprecated replay options (#11268)
- feat(v8/svelte): Remove deprecated componentTrackingPreprocessor export (#11277)
- ref: Remove more usages of getCurrentHub in the codebase (#11281)
- ref(core): Remove `scope.setSpan()` and `scope.getSpan()` methods (#11051)
- ref(profiling-node): Remove usage of getCurrentHub (#11275)
- ref(v8): change integration.setupOnce signature (#11238)
- ref: remove node-experimental references (#11290)

### Other Changes

- feat(feedback): Make "required" text for input elements configurable (#11152) (#11153)
- feat(feedback): Update user feedback screenshot and cropping to align with designs (#11227)
- feat(nextjs): Remove `runtime` and `vercel` tags (#11291)
- feat(node): Add scope to ANR events (#11256)
- feat(node): Do not include `prismaIntegration` by default (#11265)
- feat(node): Ensure `tracePropagationTargets` are respected (#11285)
- feat(node): Simplify `SentrySpanProcessor` (#11273)
- feat(profiling): Use OTEL powered node package (#11239)
- feat(utils): Allow text encoder/decoder polyfill from global **SENTRY** (#11283)
- fix(nextjs): Show misconfiguration warning (no `instrumentation.ts`) (#11266)
- fix(node): Add logs when node-fetch cannot be instrumented (#11289)
- fix(node): Skip capturing Hapi Boom error responses. (#11151)
- fix(node): Use `suppressTracing` to avoid capturing otel spans (#11288)
- fix(opentelemetry): Do not stomp span status when `startSpan` callback throws (#11170)

## 8.0.0-alpha.6

This version did not publish correctly due to a configuration issue.

## 8.0.0-alpha.5

This is the fifth alpha release of Sentry JavaScript SDK v8, which includes a variety of breaking changes.

Read the [in-depth migration guide](./MIGRATION.md) to find out how to address any breaking changes in your code.

### Important Changes

- **feat(nextjs): Remove `client.(server|client).config.ts` functionality in favor of `instrumentation.ts` (#11059)**
  - feat(nextjs): Bump minimum required Next.js version to `13.2.0` (#11097)

With version 8 of the SDK we will no longer support the use of `sentry.server.config.ts` and `sentry.edge.config.ts`
files. Instead, please initialize the Sentry Next.js SDK for the serverside in a
[Next.js instrumentation hook](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation).
**`sentry.client.config.ts|js` is still supported and encouraged for initializing the clientside SDK.** Please see the
[Migration Guide](./MIGRATION.md#updated-the-recommended-way-of-calling-sentryinit) for more details.

In addition, the Next.js SDK now requires a minimum Next.js version of `13.2.0`.

- **feat(v8/angular): Merge angular and angular-ivy packages and start Angular support at v14 (#11091)**

The `@sentry/angular-ivy` package has been removed. The `@sentry/angular` package now supports Ivy by default and
requires at least Angular 14. See the [Migration Guide](./MIGRATION.md#removal-of-sentryangular-ivy-package) for more
details.

### Removal/Refactoring of deprecated functionality

- feat(aws-serverless): Remove deprecated `rethrowAfterCapture` option (#11126)
- feat(node): Remove deprecated/duplicate/unused definitions (#11120)
- feat(v8): Remove deprecated integration methods on client (#11134)
- feat(v8/browser): Remove class export for linked errors (#11129)
- feat(v8/browser): Remove deprecated wrap export (#11127)
- feat(v8/core): Remove deprecated client.setupIntegrations method (#11179)
- feat(v8/core): Remove deprecated integration classes (#11132)
- feat(v8/ember): Remove InitSentryForEmber export (#11202)
- feat(v8/nextjs): Remove usage of class integrations (#11182)
- feat(v8/replay): Delete deprecated types (#11177)
- feat(v8/utils): Remove deprecated util functions (#11143)
- ref(node): Remove class based export for local variable integration (#11128)

### Other Changes

- feat(browser): Make fetch the default transport for offline (#11209)
- feat(core): Filter out noisy GoogleTag error by default (#11208)
- feat(deps): Bump @sentry/cli from 2.30.0 to 2.30.2 (#11168)
- feat(nextjs): Prefix webpack plugin log messages with runtime (#11173)
- feat(node-profiling): Output ESM and remove Sentry deps from output (#11135)
- feat(node): Allow Anr worker to be stopped and restarted (#11214)
- feat(node): Support `tunnel` option for ANR (#11163)
- feat(opentelemetry): Do not capture exceptions for timed events (#11221)
- feat(serverless): Add Node.js 20 to compatible runtimes (#11103)
- feat(sveltekit): Switch to Otel-based `@sentry/node` package (#11075)
- fix(attachments): Add missing `view_hierarchy` attachment type (#11197)
- fix(build): Ensure tree shaking works properly for ESM output (#11122)
- fix(feedback): Only allow screenshots in secure contexts (#11188)
- fix(feedback): Reduce force layout in screenshots (#11181)
- fix(feedback): Smoother cropping experience and better UI (#11165)
- fix(feedback): Fix screenshot black bars in Safari (#11233)
- fix(metrics): use correct statsd data category (#11184)
- fix(metrics): use web-vitals ttfb calculation (#11185)
- fix(node): Export `initOpenTelemetry` (#11158)
- fix(node): Clear ANR timer on stop (#11229)
- fix(node): Time zone handling for `cron` (#11225)
- fix(node): Use unique variable for ANR context transfer (#11161)
- fix(opentelemetry): Do not stomp span error status (#11169)
- fix(types): Fix incorrect `sampled` type on `Transaction` (#11115)

## 8.0.0-alpha.4

This is the fourth Alpha release of the v8 cycle, which includes a variety of breaking changes.

Read the [in-depth migration guide](./MIGRATION.md) to find out how to address any breaking changes in your code.

### Important Changes

- **feat: Set required node version to >=14.18.0 for all packages (#10968)**

The minimum Node version required for the SDK is now `14.18.0`.

- **Serverless SDK Changes**
  - feat(google-cloud): Add @sentry/google-cloud package (#10993)
  - feat(v8): Add @sentry/aws-serverless package (#11052)
  - feat(v8): Rename gcp package to `@sentry/google-cloud-serverless` (#11065)

`@sentry/serverless` is no longer published, and is replaced by two new packages: `@sentry/google-cloud-serverless` and
`@sentry/aws-serverless`. These packages are now the recommended way to instrument serverless functions. See the
[migration guide](./MIGRATION.md#sentryserverless) for more details.

- **build(bundles): Use ES2017 for bundles (drop ES5 support) (#10911)**

The Browser SDK and CDN bundles now emits ES2017 compatible code and drops support for IE11. This also means that the
Browser SDKs (`@sentry/browser`, `@sentry/react`, `@sentry/vue`, etc.) requires the fetch API to be available in the
environment. If you need to support older browsers, please transpile your code to ES5 using babel or similar and add
required polyfills.

New minimum supported browsers:

- Chrome 58
- Edge 15
- Safari/iOS Safari 11
- Firefox 54
- Opera 45
- Samsung Internet 7.2

### Removal/Refactoring of deprecated functionality

- feat(browser): Remove IE parser from the default stack parsers (#11035)
- feat(bun/v8): Remove all deprecations from Bun SDK (#10971)
- feat(core): Remove `startTransaction` export (#11015)
- feat(v8/core): Move addTracingHeadersToFetchRequest and instrumentFetchRequest to core (#10918)
- feat(v8/deno): Remove deprecations from deno SDK (#10972)
- feat(v8/remix): Remove remixRouterInstrumentation (#10933)
- feat(v8/replay): Opt-in options for `unmask` and `unblock` (#11049)
- feat(v8/tracing): Delete BrowserTracing class (#10919)
- feat(v8/vercel-edge): Remove vercel-edge sdk deprecations (#10974)
- feat(replay/v8): Delete deprecated `replaySession` and `errorSampleRates` (#11045)
- feat(v8): Remove deprecated Replay, Feedback, ReplayCanvas exports (#10814)
- ref: Remove `spanRecorder` and all related code (#10977)
- ref: Remove deprecated `origin` field on span start options (#11058)
- ref: Remove deprecated properties from `startSpan` options (#11054)
- ref(core): Remove `startTransaction` & `finishTransaction` hooks (#11008)
- ref(nextjs): Remove `sentry` field in Next.js config as a means of configuration (#10839)
- ref(nextjs): Remove last internal deprecations (#11019)
- ref(react): Streamline browser tracing integrations & remove old code (#11012)
- ref(svelte): Remove `startChild` deprecations (#10956)
- ref(sveltekit): Update trace propagation & span options (#10838)
- ref(v8/angular): Remove instrumentAngularRouting and fix tests (#11021)

### Other Changes

- feat: Ensure `getRootSpan()` does not rely on transaction (#10979)
- feat: Export `getSpanDescendants()` everywhere (#10924)
- feat: Make ESM output valid Node ESM (#10928)
- feat: Remove tags from spans & transactions (#10809)
- feat(angular): Update scope `transactionName` when route is resolved (#11043)
- feat(angular/v8): Change decorator naming and add `name` parameter (#11057)
- feat(astro): Update `@sentry/astro` to use OpenTelemetry (#10960)
- feat(browser): Remove `HttpContext` integration class (#10987)
- feat(browser): Use idle span for browser tracing (#10957)
- feat(build): Allow passing Sucrase options for rollup (#10747)
- feat(build): Core packages into single output files (#11030)
- feat(core): Allow custom tracing implementations (#11003)
- feat(core): Allow metrics aggregator per client (#10949)
- feat(core): Decouple `scope.transactionName` from root spans (#10991)
- feat(core): Ensure trace APIs always return a span (#10942)
- feat(core): Implement `startIdleSpan` (#10934)
- feat(core): Move globals to `__SENTRY__` singleton (#11034)
- feat(core): Move more scope globals to `__SENTRY__` (#11074)
- feat(core): Undeprecate setTransactionName (#10966)
- feat(core): Update `continueTrace` to be callback-only (#11044)
- feat(core): Update `spanToJSON` to handle OTEL spans (#10922)
- feat(deps): bump @sentry/cli from 2.29.1 to 2.30.0 (#11024)
- feat(feedback): New feedback integration with screenshots (#10590)
- feat(nextjs): Bump Webpack Plugin to version 2 and rework config options (#10978)
- feat(nextjs): Support Hybrid Cloud DSNs with `tunnelRoute` option (#10959)
- feat(node): Add `setupFastifyErrorHandler` utility (#11061)
- feat(node): Rephrase wording in http integration JSDoc (#10947)
- feat(opentelemetry): Do not use SentrySpan & Transaction classes (#10982)
- feat(opentelemetry): Remove hub from context (#10983)
- feat(opentelemetry): Use core `getRootSpan` functionality (#11004)
- feat(profiling-node): Refactor deprecated methods & non-hook variant (#10984)
- feat(react): Update scope's `transactionName` in React Router instrumentations (#11048)
- feat(remix): Refactor to use new performance APIs (#10980)
- feat(remix): Update remix SDK to be OTEL-powered (#11031)
- feat(sveltekit): Export `unstable_sentryVitePluginOptions` for full Vite plugin customization (#10930)
- feat(v8/bun): Update @sentry/bun to use OTEL node (#10997)
- fix(ember): Ensure browser tracing is correctly lazy loaded (#11026)
- fix(nextjs): Use passthrough `createReduxEnhancer` on server (#11005)
- fix(node): Add missing core re-exports (#10931)
- fix(node): Correct SDK name (#10961)
- fix(node): Do not assert in vendored proxy code (#11011)
- fix(node): Export spotlightIntegration from OTEL node (#10973)
- fix(node): support undici headers as strings or arrays (#10938)
- fix(opentelemetry): Fix span & sampling propagation (#11092)
- fix(react): Passes the fallback function through React's createElement function (#10623)
- fix(react): Set `handled` value in ErrorBoundary depending on fallback (#10989)
- fix(types): Add `addScopeListener` to `Scope` interface (#10952)
- fix(types): Add `AttachmentType` and use for envelope `attachment_type` property (#10946)
- fix(types): Remove usage of `allowSyntheticDefaultImports` (#11073)
- fix(v8/utils): Stack parser skip frames (not lines of stack string) (#10560)
- ref(angular): Refactor usage of `startChild` (#11056)
- ref(browser): Store browser metrics as attributes instead of tags (#10823)
- ref(browser): Update `scope.transactionName` on pageload and navigation span creation (#10992)
- ref(browser): Update browser metrics to avoid deprecations (#10943)
- ref(browser): Update browser profiling to avoid deprecated APIs (#11007)
- ref(feedback): Move UserFeedback type into feedback.ts (#11032)
- ref(nextjs): Clean up browser tracing integration (#11022)
- ref(node-experimental): Refactor usage of `startChild()` (#11047)
- ref(node): Use new performance APIs in legacy `http` & `undici` (#11055)
- ref(opentelemetry): Remove parent span map (#11014)
- ref(opentelemetry): Remove span metadata handling (#11020)

Work in this release contributed by @MFoster and @jessezhang91. Thank you for your contributions!

## 8.0.0-alpha.3

This alpha was released in an incomplete state. We recommend skipping this release and using the `8.0.0-alpha.4` release
instead.

## 8.0.0-alpha.2

This alpha release fixes a build problem that prevented 8.0.0-alpha.1 from being properly released.

### Important Changes

- **feat: Remove `@sentry/opentelemetry-node` package (#10906)**

The `@sentry/opentelemetry-node` package has been removed. Instead, you can either use `@sentry/node` with built-in
OpenTelemetry support, or use `@sentry/opentelemetry` to manually connect Sentry with OpenTelemetry.

### Removal/Refactoring of deprecated functionality

- ref: Refactor some deprecated `startSpan` options (#10825)
- feat(v8/core): remove void from transport return (#10794)
- ref(integrations): Delete deprecated class integrations (#10887)

### Other Changes

- feat(core): Use serialized spans in transaction event (#10912)
- feat(deps): bump @sentry/cli from 2.28.6 to 2.29.1 (#10908)
- feat(node): Allow to configure `skipOpenTelemetrySetup` (#10907)
- feat(esm): Import rather than require `inspector` (#10910)
- fix(browser): Don't use chrome variable name (#10874)
- chore(sveltekit): Fix punctuation in a console.log (#10895)
- fix(opentelemetry): Ensure DSC propagation works correctly (#10904)
- feat(browser): Exclude span exports from non-performance CDN bundles (#10879)
- ref: Refactor span status handling to be OTEL compatible (#10871)
- feat(core): Fix span scope handling & transaction setting (#10886)
- ref(ember): Avoid namespace import to hopefully resolve minification issue (#10885)

Work in this release contributed by @harish-talview & @bfontaine. Thank you for your contributions!

## 8.0.0-alpha.1

This is the first Alpha release of the v8 cycle, which includes a variety of breaking changes.

Read the [in-depth migration guide](./MIGRATION.md) to find out how to address any breaking changes in your code.

### Important Changes

**- feat(node): Make `@sentry/node` powered by OpenTelemetry (#10762)**

The biggest change is the switch to use OpenTelemetry under the hood in `@sentry/node`. This brings with it a variety of
changes:

- There is now automated performance instrumentation for Express, Fastify, Nest.js and Koa. You can remove any
  performance and request isolation code you previously wrote manually for these frameworks.
- All performance instrumention is enabled by default, and will only take effect if the instrumented package is used.
  You don't need to use `autoDiscoverNodePerformanceMonitoringIntegrations()` anymore.
- You need to ensure to call `Sentry.init()` _before_ you import any other packages. Otherwise, the packages cannot be
  instrumented:

```js
const Sentry = require('@sentry/node');
Sentry.init({
  dsn: '...',
  // ... other config here
});
// now require other things below this!
const http = require('http');
const express = require('express');
// ....
```

- Currently, we only support CJS-based Node application out of the box. There is experimental ESM support, see
  [the instructions](./packages/node-experimental/README.md#esm-support).
- `startTransaction` and `span.startChild()` are no longer supported. This is due to the underlying change to
  OpenTelemetry powered performance instrumentation. See
  [docs on the new performance APIs](./docs/v8-new-performance-apis.md) for details.

Related changes:

- feat(node-experimental): Add missing re-exports (#10679)
- feat(node-experimental): Move `defaultStackParser` & `getSentryRelease` (#10722)
- feat(node-experimental): Move `errorHandler` (#10728)
- feat(node-experimental): Move cron code over (#10742)
- feat(node-experimental): Move integrations from node (#10743)
- feat(node-experimental): Properly set request & session on http requests (#10676)
- feat(opentelemetry): Support `forceTransaction` in OTEL (#10807)
- feat(opentelemetry): Align span options with core span options (#10761)
- feat(opentelemetry): Do not capture span events as breadcrumbs (#10612)
- feat(opentelemetry): Ensure DSC & attributes are correctly set (#10806)
- feat(opentelemetry): Fix & align isolation scope usage in node-experimental (#10570)
- feat(opentelemetry): Merge node-experimental changes into opentelemetry (#10689)
- ref(node-experimental): Cleanup re-exports (#10741)
- ref(node-experimental): Cleanup tracing intergations (#10730)
- ref(node-experimental): Copy transport & client to node-experimental (#10720)
- ref(node-experimental): Remove custom `isInitialized` (#10607)
- ref(node-experimental): Remove custom hub & scope (#10616)
- ref(node-experimental): Remove deprecated class integrations (#10675)
- ref(node-experimental): Rename `errorHandler` to `expressErrorHandler` (#10746)
- ref(node-integration-tests): Migrate to new Http integration (#10765)
- ref(node): Align semantic attribute handling (#10827)

**- feat: Remove `@sentry/integrations` package (#10799)**

This package is no longer published. You can instead import these pluggable integrations directly from your SDK package
(e.g. `@sentry/browser` or `@sentry/react`).

**- feat: Remove `@sentry/hub` package (#10783)**

This package is no longer published. You can instead import directly from your SDK package (e.g. `@sentry/react` or
`@sentry/node`).

**- feat(v8): Remove @sentry/tracing (#10625)**

This package is no longer published. You can instead import directly from your SDK package (e.g. `@sentry/react` or
`@sentry/node`).

**- feat: Set required node version to >=14.8.0 for all packages (#10834)**

The minimum required node version is now 14.8+. If you need support for older node versions, you can stay on the v7
branch.

**- Removed class-based integrations**

We have removed most of the deprecated class-based integrations. Instead, you can use the functional styles:

```js
import * as Sentry from '@sentry/browser';
// v7
Sentry.init({
  integrations: [new Sentry.BrowserTracing()],
});
// v8
Sentry.init({
  integrations: [new Sentry.browserTracingIntegration()],
});
```

- ref: Remove `BrowserTracing` (#10653)
- feat(v8/node): Remove LocalVariables class integration (#10558)
- feat(v8/react): Delete react router exports (#10532)
- feat(v8/vue): Remove all deprecated exports from vue (#10533)
- feat(v8/wasm): Remove deprecated exports (#10552)

**- feat(v8/browser): Remove XHR transport (#10703)**

We have removed the XHR transport, and are instead using the fetch-based transport now by default. This means that if
you are using Sentry in a browser environment without fetch, you'll need to either provide a fetch polyfill, or provide
a custom transport to Sentry.

**- feat(sveltekit): Update `@sentry/vite-plugin` to 2.x and adjust options API (#10813)**

We have updated `@sentry/sveltekit` to use the latest version of `@sentry/vite-plugin`, which lead to changes in
configuration options.

### Other Changes

- feat: Ensure `withActiveSpan` is exported everywhere (#10878)
- feat: Allow passing `null` to `withActiveSpan` (#10717)
- feat: Implement new Async Context Strategy (#10647)
- feat: Remove `hub` from global, `hub.run` & hub utilities (#10718)
- feat: Update default trace propagation targets logic in the browser (#10621)
- feat: Ignore ResizeObserver and undefined error (#10845)
- feat(browser): Export `getIsolationScope` and `getGlobalScope` (#10658)
- feat(browser): Prevent initialization in browser extensions (#10844)
- feat(core): Add metric summaries to spans (#10554)
- feat(core): Decouple metrics aggregation from client (#10628)
- feat(core): Lookup client on current scope, not hub (#10635)
- feat(core): Make `setXXX` methods set on isolation scope (#10678)
- feat(core): Make custom tracing methods return spans & set default op (#10633)
- feat(core): Make global `addBreadcrumb` write to the isolation scope instead of current scope (#10586)
- feat(core): Remove health check transaction filters (#10818)
- feat(core): Streamline custom hub creation for node-experimental (#10555)
- feat(core): Update `addEventProcessor` to add to isolation scope (#10606)
- feat(core): Update `Sentry.addBreadcrumb` to skip hub (#10601)
- feat(core): Use global `TextEncoder` and `TextDecoder` (#10701)
- feat(deps): bump @sentry/cli from 2.26.0 to 2.28.0 (#10496)
- feat(deps): bump @sentry/cli from 2.28.0 to 2.28.5 (#10620)
- feat(deps): bump @sentry/cli from 2.28.5 to 2.28.6 (#10727)
- feat(integrations): Capture error arguments as exception regardless of level in `captureConsoleIntegration` (#10744)
- feat(metrics): Remove metrics method from `BaseClient` (#10789)
- feat(node): Remove unnecessary URL imports (#10860)
- feat(react): Drop support for React 15 (#10115)
- feat(remix): Add Vite dev-mode support to Express instrumentation. (#10784)
- fix: Export session API (#10711)
- fix(angular-ivy): Add `exports` field to `package.json` (#10569)
- fix(angular): Ensure navigations always create a transaction (#10646)
- fix(core): Add lost scope tests & fix update case (#10738)
- fix(core): Fix scope capturing via `captureContext` function (#10735)
- fix(feedback): Replay breadcrumb for feedback events was incorrect (#10536)
- fix(nextjs): Remove `webpack://` prefix more broadly from source map `sources` field (#10642)
- fix(node): import `worker_threads` and fix node v14 types (#10791)
- fix(node): Record local variables with falsy values, `null` and `undefined` (#10821)
- fix(stacktrace): Always use `?` for anonymous function name (#10732)
- fix(sveltekit): Avoid capturing Http 4xx errors on the client (#10571)
- fix(sveltekit): Ensure navigations and redirects always create a new transaction (#10656)
- fix(sveltekit): Properly await sourcemaps flattening (#10602)
- fix(types): Improve attachment type (#10832)
- fx(node): Fix anr worker check (#10719)
- ref: Cleanup browser profiling integration (#10766)
- ref: Collect child spans references via non-enumerable on Span object (#10715)
- ref: Make scope setters on hub only write to isolation scope (#10572)
- ref: Store runtime on isolation scope (#10657)
- ref(astro): Put request as SDK processing metadata instead of span data (#10840)
- ref(core): Always use a (default) ACS (#10644)
- ref(core): Make `on` and `emit` required on client (#10603)
- ref(core): Make remaining client methods required (#10605)
- ref(core): Rename `Span` class to `SentrySpan` (#10687)
- ref(core): Restructure hub exports (#10639)
- ref(core): Skip hub in top level `captureXXX` methods (#10688)
- ref(core): Allow `number` as span `traceFlag` (#10855)
- ref(core): Remove `status` field from Span (#10856)
- ref(remix): Make `@remix-run/router` a dependency. (#10479)
- ref(replay): Use `beforeAddBreadcrumb` hook instead of scope listener (#10600)
- ref(sveltekit): Hard-pin Vite plugin version (#10843)

### Other Deprecation Removals/Changes

We have also removed or updated a variety of deprecated APIs.

- feat(v8): Remove `extractTraceparentData` export (#10559)
- feat(v8): Remove defaultIntegrations deprecated export (#10691)
- feat(v8): Remove deprecated `span.isSuccess` method (#10699)
- feat(v8): Remove deprecated `traceHeaders` method (#10776)
- feat(v8): Remove deprecated addInstrumentationHandler (#10693)
- feat(v8): Remove deprecated configureScope call (#10565)
- feat(v8): Remove deprecated runWithAsyncContext API (#10780)
- feat(v8): Remove deprecated spanStatusfromHttpCode export (#10563)
- feat(v8): Remove deprecated trace and startActiveSpan methods (#10593)
- feat(v8): Remove requestData deprecations (#10626)
- feat(v8): Remove Severity enum (#10551)
- feat(v8): Remove span.origin (#10753)
- feat(v8): Remove span.toTraceparent method (#10698)
- feat(v8): Remove usage of span.description and span.name (#10697)
- feat(v8): Update eventFromUnknownInput to only use client (#10692)
- feat(v8/astro): Remove deprecated exports from Astro SDK (#10611)
- feat(v8/browser): Remove `_eventFromIncompleteOnError` usage (#10553)
- feat(v8/browser): Remove XHR transport (#10703)
- feat(v8/browser): Rename TryCatch integration to `browserApiErrorsIntegration` (#10755)
- feat(v8/core): Remove deprecated setHttpStatus (#10774)
- feat(v8/core): Remove deprecated updateWithContext method (#10800)
- feat(v8/core): Remove getters for span.op (#10767)
- feat(v8/core): Remove span.finish call (#10773)
- feat(v8/core): Remove span.instrumenter and instrumenter option (#10769)
- feat(v8/ember): Remove deprecated exports (#10535)
- feat(v8/integrations): Remove deprecated exports (#10556)
- feat(v8/node): Remove deepReadDirSync export (#10564)
- feat(v8/node): Remove deprecated anr methods (#10562)
- feat(v8/node): Remove getModuleFromFilename export (#10754)
- feat(core): Remove deprecated props from `Span` interface (#10854)
- fix(v8): Remove deprecated tracing config (#10870)
- ref: Make `setupOnce` optional in integrations (#10729)
- ref: Migrate transaction source from metadata to attributes (#10674)
- ref: Refactor remaining `makeMain` usage (#10713)
- ref(astro): Remove deprecated Replay and BrowserTracing (#10768)
- feat(core): Remove deprecated `scope.applyToEvent()` method (#10842)
- ref(integrations): Remove offline integration (#9456)
- ref(nextjs): Remove all deprecated API (#10549)
- ref: Remove `lastEventId` (#10585)
- ref: Remove `reuseExisting` option for ACS (#10645)
- ref: Remove `tracingOrigins` options (#10614)
- ref: Remove deprecated `showReportDialog` APIs (#10609)
- ref: Remove usage of span tags (#10808)
- ref: Remove user segment (#10575)

## 7.x

A full list of changes in the `7.x` release of the SDK can be found in the [7.x Changelog](./docs/changelog/v7.md).

## 6.x

A full list of changes in the `6.x` release of the SDK can be found in the [6.x Changelog](./docs/changelog/v6.md).

## 5.x

A full list of changes in the `5.x` release of the SDK can be found in the [5.x Changelog](./docs/changelog/v5.md).

## 4.x

A full list of changes in the `4.x` release of the SDK can be found in the [4.x Changelog](./docs/changelog/v4.md).
