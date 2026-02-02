# Changelog

## Unreleased

- "You miss 100 percent of the chances you don't take. — Wayne Gretzky" — Michael Scott

- **feat(tanstackstart-react): Auto-instrument server function middleware ([#19001](https://github.com/getsentry/sentry-javascript/pull/19001))**

  The `sentryTanstackStart` Vite plugin now automatically instruments middleware in `createServerFn().middleware([...])` calls. This captures performance data without requiring manual wrapping with `wrapMiddlewaresWithSentry()`.

## 10.38.0

### Important Changes

- **feat(tanstackstart-react): Auto-instrument request middleware ([#18989](https://github.com/getsentry/sentry-javascript/pull/18989))**

  The `sentryTanstackStart` Vite plugin now automatically instruments `middleware` arrays in `createFileRoute()`. This captures performance data without requiring manual wrapping with `wrapMiddlewaresWithSentry()`.

### Other Changes

- feat: Use v4.8.0 bundler plugins ([#18993](https://github.com/getsentry/sentry-javascript/pull/18993))
- feat(browser): Add `logs.metrics` bundle ([#19020](https://github.com/getsentry/sentry-javascript/pull/19020))
- feat(browser): Add `replay.logs.metrics` bundle ([#19021](https://github.com/getsentry/sentry-javascript/pull/19021))
- feat(browser): Add `tracing.replay.logs.metrics` bundle ([#19039](https://github.com/getsentry/sentry-javascript/pull/19039))
- feat(deps): bump import-in-the-middle from 2.0.1 to 2.0.6 ([#19042](https://github.com/getsentry/sentry-javascript/pull/19042))
- feat(node): Add AI manual instrumentation exports to Node ([#19063](https://github.com/getsentry/sentry-javascript/pull/19063))
- feat(wasm): initialised sentryWasmImages for webworkers ([#18812](https://github.com/getsentry/sentry-javascript/pull/18812))
- fix(core): Classify custom `AggregateError`s as exception groups ([#19053](https://github.com/getsentry/sentry-javascript/pull/19053))
- fix(nextjs): Turn off debugID injection if sourcemaps are explicitly disabled ([#19010](https://github.com/getsentry/sentry-javascript/pull/19010))
- fix(react): Avoid `String(key)` to fix Symbol conversion error ([#18982](https://github.com/getsentry/sentry-javascript/pull/18982))
- fix(react): Prevent lazy route handlers from updating wrong navigation span ([#18898](https://github.com/getsentry/sentry-javascript/pull/18898))

<details>
  <summary><strong>Internal Changes</strong></summary>
- feat(deps-dev): bump @types/rsvp from 4.0.4 to 4.0.9 ([#19038](https://github.com/getsentry/sentry-javascript/pull/19038))
- ci(build): Run full test suite on new bundle with logs+metrics ([#19065](https://github.com/getsentry/sentry-javascript/pull/19065))
- ci(deps): bump actions/create-github-app-token from 1 to 2 ([#19028](https://github.com/getsentry/sentry-javascript/pull/19028))
- ci(deps): bump peter-evans/create-pull-request from 8.0.0 to 8.1.0 ([#19029](https://github.com/getsentry/sentry-javascript/pull/19029))
- chore: Add external contributor to CHANGELOG.md ([#19005](https://github.com/getsentry/sentry-javascript/pull/19005))
- chore(aws-serverless): Fix local cache issues ([#19081](https://github.com/getsentry/sentry-javascript/pull/19081))
- chore(dependabot): Allow all packages to update ([#19024](https://github.com/getsentry/sentry-javascript/pull/19024))
- chore(dependabot): Update ignore patterns and add more groups ([#19037](https://github.com/getsentry/sentry-javascript/pull/19037))
- chore(dependabot): Update ignore patterns and add more groups ([#19043](https://github.com/getsentry/sentry-javascript/pull/19043))
- chore(deps-dev): bump @edge-runtime/types from 3.0.1 to 4.0.0 ([#19032](https://github.com/getsentry/sentry-javascript/pull/19032))
- chore(deps-dev): bump @vercel/nft from 0.29.4 to 1.3.0 ([#19030](https://github.com/getsentry/sentry-javascript/pull/19030))
- chore(deps): bump @actions/artifact from 2.1.11 to 5.0.3 ([#19031](https://github.com/getsentry/sentry-javascript/pull/19031))
- chore(deps): bump hono from 4.11.4 to 4.11.7 in /dev-packages/e2e-tests/test-applications/cloudflare-hono ([#19009](https://github.com/getsentry/sentry-javascript/pull/19009))
- chore(deps): bump next from 16.0.9 to 16.1.5 in /dev-packages/e2e-tests/test-applications/nextjs-16-cacheComponents ([#19012](https://github.com/getsentry/sentry-javascript/pull/19012))
- chore(deps): Bump trpc v11 dependency in e2e test ([#19061](https://github.com/getsentry/sentry-javascript/pull/19061))
- chore(deps): Bump wrangler to 4.61.0 ([#19023](https://github.com/getsentry/sentry-javascript/pull/19023))
- chore(deps): Upgrade @remix-run deps to 2.17.4 ([#19040](https://github.com/getsentry/sentry-javascript/pull/19040))
- chore(deps): Upgrade `next` versions 15 and 16 ([#19057](https://github.com/getsentry/sentry-javascript/pull/19057))
- chore(deps): Upgrade Lerna to v8 ([#19050](https://github.com/getsentry/sentry-javascript/pull/19050))
- chore(deps): Upgrade next to 14.2.35 ([#19055](https://github.com/getsentry/sentry-javascript/pull/19055))
- chore(deps): Upgrade react-router, @react-router/node, @react-router/serve, @react-router/dev to 7.13.0 ([#19026](https://github.com/getsentry/sentry-javascript/pull/19026))
- chore(llm): Add claude skill + cursor command for adding new cdn bundles ([#19048](https://github.com/getsentry/sentry-javascript/pull/19048))
- chore(llm): Ignore local Claude settings ([#18893](https://github.com/getsentry/sentry-javascript/pull/18893))
- chore(react): Update react-router-5 dev dependency to another than 5.0.0 ([#19047](https://github.com/getsentry/sentry-javascript/pull/19047))
- chore(release): Add generate-changelog script ([#18999](https://github.com/getsentry/sentry-javascript/pull/18999))
- chore(remix): Upgrade @remix-run/router to ^1.23.2 ([#19045](https://github.com/getsentry/sentry-javascript/pull/19045))
- chore(solidstart): Bump peer dependencies of @solidjs/start ([#19051](https://github.com/getsentry/sentry-javascript/pull/19051))
- chore(solidstart): Upgrade Vinxi to update h3 peer dependency ([#19018](https://github.com/getsentry/sentry-javascript/pull/19018))
- chore(tests): Reject messages from unknown origins in integration tests ([#19016](https://github.com/getsentry/sentry-javascript/pull/19016))

</details>

Work in this release was contributed by @harshit078. Thank you for your contribution!

## 10.37.0

### Important Changes

- **feat(core): Introduces a new `Sentry.setConversationId()` API to track multi turn AI conversations across API calls. ([#18909](https://github.com/getsentry/sentry-javascript/pull/18909))**

  You can now set a conversation ID that will be automatically applied to spans within that scope. This allows you to link traces from the same conversation together.

  ```javascript
  import * as Sentry from '@sentry/node';

  // Set conversation ID for all subsequent spans
  Sentry.setConversationId('conv_abc123');

  // All AI spans will now include the gen_ai.conversation.id attribute
  await openai.chat.completions.create({...});
  ```

  This is particularly useful for tracking multiple AI API calls that are part of the same conversation, allowing you to analyze entire conversation flows in Sentry.
  The conversation ID is stored on the isolation scope and automatically applied to spans via the new `conversationIdIntegration`.

- **feat(tanstackstart-react): Auto-instrument global middleware in `sentryTanstackStart` Vite plugin ([#18844](https://github.com/getsentry/sentry-javascript/pull/18844))**

  The `sentryTanstackStart` Vite plugin now automatically instruments `requestMiddleware` and `functionMiddleware` arrays in `createStart()`. This captures performance data without requiring manual wrapping.

  Auto-instrumentation is enabled by default. To disable it:

  ```ts
  // vite.config.ts
  sentryTanstackStart({
    authToken: process.env.SENTRY_AUTH_TOKEN,
    org: 'your-org',
    project: 'your-project',
    autoInstrumentMiddleware: false,
  });
  ```

### Other Changes

- feat(core): simplify truncation logic to only keep the newest message ([#18906](https://github.com/getsentry/sentry-javascript/pull/18906))
- feat(core): Support new client discard reason `invalid` ([#18901](https://github.com/getsentry/sentry-javascript/pull/18901))
- feat(deps): Bump OpenTelemetry instrumentations ([#18934](https://github.com/getsentry/sentry-javascript/pull/18934))
- feat(nextjs): Update default ignore list for sourcemaps ([#18938](https://github.com/getsentry/sentry-javascript/pull/18938))
- feat(node): pass prisma instrumentation options through ([#18900](https://github.com/getsentry/sentry-javascript/pull/18900))
- feat(nuxt): Don't run source maps related code on Nuxt "prepare" ([#18936](https://github.com/getsentry/sentry-javascript/pull/18936))
- feat(replay): Update client report discard reason for invalid sessions ([#18796](https://github.com/getsentry/sentry-javascript/pull/18796))
- feat(winston): Add customLevelMap for winston transport ([#18922](https://github.com/getsentry/sentry-javascript/pull/18922))
- feat(react-router): Add support for React Router instrumentation API ([#18580](https://github.com/getsentry/sentry-javascript/pull/18580))
- fix(astro): Do not show warnings for valid options ([#18947](https://github.com/getsentry/sentry-javascript/pull/18947))
- fix(core): Report well known values in gen_ai.operation.name attribute ([#18925](https://github.com/getsentry/sentry-javascript/pull/18925))
- fix(node-core): ignore vercel `AbortError` by default on unhandled rejection ([#18973](https://github.com/getsentry/sentry-javascript/pull/18973))
- fix(nuxt): include sentry.config.server.ts in nuxt app types ([#18971](https://github.com/getsentry/sentry-javascript/pull/18971))
- fix(profiling): Add `platform` to envelope item header ([#18954](https://github.com/getsentry/sentry-javascript/pull/18954))
- fix(react): Defer React Router span finalization until lazy routes load ([#18881](https://github.com/getsentry/sentry-javascript/pull/18881))
- ref(core): rename `gen_ai.input.messages.original_length` to `sentry.sdk_meta.gen_ai.input.messages.original_length` ([#18970](https://github.com/getsentry/sentry-javascript/pull/18970))
- ref(core): rename `gen_ai.request.messages` to `gen_ai.input.messages` ([#18944](https://github.com/getsentry/sentry-javascript/pull/18944))
- ref(core): Set system message as separate attribute ([#18978](https://github.com/getsentry/sentry-javascript/pull/18978))
- deps: Bump version of sentry-bundler-plugins ([#18972](https://github.com/getsentry/sentry-javascript/pull/18972))

<details>
  <summary><strong>Internal Changes</strong></summary>

- chore(e2e): Add e2e claude skill ([#18957](https://github.com/getsentry/sentry-javascript/pull/18957))
- chore(e2e): Add Makefile to make running specific e2e test apps easier ([#18953](https://github.com/getsentry/sentry-javascript/pull/18953))
- chore(e2e): Modify e2e skill to also account for untracked files ([#18959](https://github.com/getsentry/sentry-javascript/pull/18959))
- ref(tests): use constants in ai integration tests and add missing ones ([#18945](https://github.com/getsentry/sentry-javascript/pull/18945))
- test(nextjs): Added nextjs CF workers test app ([#18928](https://github.com/getsentry/sentry-javascript/pull/18928))
- test(prisma): Move to yarn prisma ([#18975](https://github.com/getsentry/sentry-javascript/pull/18975))

</details>

Work in this release was contributed by @sebws, @harshit078, and @fedetorre. Thank you for your contributions!

## 10.36.0

- feat(node): Add Prisma v7 support ([#18908](https://github.com/getsentry/sentry-javascript/pull/18908))
- feat(opentelemetry): Support `db.system.name` attribute for database spans ([#18902](https://github.com/getsentry/sentry-javascript/pull/18902))
- feat(deps): Bump OpenTelemetry dependencies ([#18878](https://github.com/getsentry/sentry-javascript/pull/18878))
- fix(core): Sanitize data URLs in `http.client` spans ([#18896](https://github.com/getsentry/sentry-javascript/pull/18896))
- fix(nextjs): Add ALS runner fallbacks for serverless environments ([#18889](https://github.com/getsentry/sentry-javascript/pull/18889))
- fix(node): Profiling debug ID matching

<details>
  <summary><strong>Internal Changes</strong></summary>

- chore(deps-dev): bump @remix-run/server-runtime from 2.15.2 to 2.17.3 in /packages/remix ([#18750](https://github.com/getsentry/sentry-javascript/pull/18750))

</details>

## 10.35.0

### Important Changes

- **feat(tanstackstart-react): Add `sentryTanstackStart` vite plugin to manage automatic source map uploads ([#18712](https://github.com/getsentry/sentry-javascript/pull/18712))**

  You can now configure source maps upload for TanStack Start using the `sentryTanstackStart` Vite plugin:

  ```ts
  // vite.config.ts
  import { defineConfig } from 'vite';
  import { sentryTanstackStart } from '@sentry/tanstackstart-react';
  import { tanstackStart } from '@tanstack/react-start/plugin/vite';

  export default defineConfig({
    plugins: [
      sentryTanstackStart({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: 'your-org',
        project: 'your-project',
      }),
      tanstackStart(),
    ],
  });
  ```

### Other Changes

- feat(browser): Add CDN bundle for `tracing.replay.feedback.logs.metrics` ([#18785](https://github.com/getsentry/sentry-javascript/pull/18785))
- feat(browser): Add shim package for logs ([#18831](https://github.com/getsentry/sentry-javascript/pull/18831))
- feat(cloudflare): Automatically set the release id when CF_VERSION_METADATA is enabled ([#18855](https://github.com/getsentry/sentry-javascript/pull/18855))
- feat(core): Add `ignored` client report event drop reason ([#18815](https://github.com/getsentry/sentry-javascript/pull/18815))
- feat(logs): Add `Log` exports to browser and node packages ([#18857](https://github.com/getsentry/sentry-javascript/pull/18857))
- feat(node-core,bun): Export processSessionIntegration from node-core and add it to bun ([#18852](https://github.com/getsentry/sentry-javascript/pull/18852))
- fix(core): Find the correct IP address regardless their case ([#18880](https://github.com/getsentry/sentry-javascript/pull/18880))
- fix(core): Check for AI operation id to detect a vercelai span ([#18823](https://github.com/getsentry/sentry-javascript/pull/18823))
- fix(ember): Use ES5 syntax in inline vendor scripts ([#18858](https://github.com/getsentry/sentry-javascript/pull/18858))
- fix(fetch): Shallow-clone fetch options to prevent mutation ([#18867](https://github.com/getsentry/sentry-javascript/pull/18867))

<details>
  <summary><strong>Internal Changes</strong></summary>

- chore(ci): Use javascript-sdk-gitflow app instead of personal token ([#18829](https://github.com/getsentry/sentry-javascript/pull/18829))
- chore(deps): Bump `@sveltejs/kit` devDependency to `2.49.5` ([#18848](https://github.com/getsentry/sentry-javascript/pull/18848))
- chore(deps): Bump bundler plugins to ^4.6.2 ([#18822](https://github.com/getsentry/sentry-javascript/pull/18822))
- chore(deps): bump hono from 4.10.3 to 4.11.4 in /dev-packages/e2e-tests/test-applications/cloudflare-hono ([#18806](https://github.com/getsentry/sentry-javascript/pull/18806))
- chore(test): Bump svelte dependencies ([#18850](https://github.com/getsentry/sentry-javascript/pull/18850))
- chore(core): Comment out Error tests in langchain ([#18837](https://github.com/getsentry/sentry-javascript/pull/18837))
- meta(changelog): Fix entry for tanstack start vite plugin ([#18883](https://github.com/getsentry/sentry-javascript/pull/18883))
- test(e2e): Add testing app for User Feedback ([#18877](https://github.com/getsentry/sentry-javascript/pull/18877))
- test(fastify): Verify if upstream error is fixed and won't regress ([#18838](https://github.com/getsentry/sentry-javascript/pull/18838))

</details>

Work in this release was contributed by @rreckonerr. Thank you for your contribution!

## 10.34.0

### Important Changes

- **feat(core): Add option to enhance the fetch error message ([#18466](https://github.com/getsentry/sentry-javascript/pull/18466))**

  You can now enable enhanced fetch error messages by setting the `enhancedFetchErrorMessage` option. When enabled, the SDK will include additional context in fetch error messages to help with debugging.

- **feat(nextjs): Add routeManifestInjection option to exclude routes from client bundle ([#18798](https://github.com/getsentry/sentry-javascript/pull/18798))**

  A new `routeManifestInjection` option allows you to exclude sensitive routes from being injected into the client bundle.

- **feat(tanstackstart-react): Add `wrapMiddlewaresWithSentry` for manual middleware instrumentation ([#18680](https://github.com/getsentry/sentry-javascript/pull/18680))**

  You can now wrap your middlewares using `wrapMiddlewaresWithSentry`, allowing you to trace middleware execution in your TanStack Start application.

  ```ts
  import { createMiddleware } from '@tanstack/react-start';
  import { wrapMiddlewaresWithSentry } from '@sentry/tanstackstart-react';

  const loggingMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
    console.log('Request started');
    return next();
  });

  export const [wrappedLoggingMiddleware] = wrapMiddlewaresWithSentry({ loggingMiddleware });
  ```

### Other Changes

- feat(browser): Add CDN bundle for `tracing.logs.metrics` ([#18784](https://github.com/getsentry/sentry-javascript/pull/18784))
- feat(core,node-core): Consolidate bun and node types with ServerRuntimeOptions ([#18734](https://github.com/getsentry/sentry-javascript/pull/18734))
- feat(nextjs): Remove tracing from generation function template ([#18733](https://github.com/getsentry/sentry-javascript/pull/18733))
- fix(core): Don't record outcomes for failed client reports ([#18808](https://github.com/getsentry/sentry-javascript/pull/18808))
- fix(deno,cloudflare): Prioritize name from params over name from options ([#18800](https://github.com/getsentry/sentry-javascript/pull/18800))
- fix(web-vitals): Add error handling for invalid object keys in `WeakMap` ([#18809](https://github.com/getsentry/sentry-javascript/pull/18809))

<details>
  <summary><strong>Internal Changes</strong></summary>

- ref(nextjs): Split `withSentryConfig` ([#18777](https://github.com/getsentry/sentry-javascript/pull/18777))
- test(e2e): Pin @shopify/remix-oxygen to unblock ci ([#18811](https://github.com/getsentry/sentry-javascript/pull/18811))

</details>

## 10.33.0

### Important Changes

- **feat(core): Apply scope attributes to metrics ([#18738](https://github.com/getsentry/sentry-javascript/pull/18738))**

  You can now set attributes on the SDK's scopes which will be applied to all metrics as long as the respective scopes are active. For the time being, only `string`, `number` and `boolean` attribute values are supported.

  ```ts
  Sentry.getGlobalScope().setAttributes({ is_admin: true, auth_provider: 'google' });

  Sentry.withScope(scope => {
    scope.setAttribute('step', 'authentication');

    // scope attributes `is_admin`, `auth_provider` and `step` are added
    Sentry.metrics.count('clicks', 1, { attributes: { activeSince: 100 } });
    Sentry.metrics.gauge('timeSinceRefresh', 4, { unit: 'hour' });
  });

  // scope attributes `is_admin` and `auth_provider` are added
  Sentry.metrics.count('response_time', 283.33, { unit: 'millisecond' });
  ```

- **feat(tracing): Add Vercel AI SDK v6 support ([#18741](https://github.com/getsentry/sentry-javascript/pull/18741))**

  The Sentry SDK now supports the Vercel AI SDK v6. Tracing and error monitoring will work automatically with the new version.

- **feat(wasm): Add applicationKey option for third-party error filtering ([#18762](https://github.com/getsentry/sentry-javascript/pull/18762))**

  Adds support for applying an application key to WASM stack frames that can be then used in the `thirdPartyErrorFilterIntegration` for detection of first-party code.

  Usage:

  ```js
  Sentry.init({
    integrations: [
      // Integration order matters: wasmIntegration needs to be before thirdPartyErrorFilterIntegration
      wasmIntegration({ applicationKey: 'your-custom-application-key' }), ←───┐
      thirdPartyErrorFilterIntegration({                                      │
        behaviour: 'drop-error-if-exclusively-contains-third-party-frames',   ├─ matching keys
        filterKeys: ['your-custom-application-key'] ←─────────────────────────┘
      }),
    ],
  });
  ```

### Other Changes

- feat(cloudflare): Support `propagateTraceparent` ([#18569](https://github.com/getsentry/sentry-javascript/pull/18569))
- feat(core): Add `ignoreSentryInternalFrames` option to `thirdPartyErrorFilterIntegration` ([#18632](https://github.com/getsentry/sentry-javascript/pull/18632))
- feat(core): Add gen_ai.conversation.id attribute to OpenAI and LangGr… ([#18703](https://github.com/getsentry/sentry-javascript/pull/18703))
- feat(core): Add recordInputs/recordOutputs options to MCP server wrapper ([#18600](https://github.com/getsentry/sentry-javascript/pull/18600))
- feat(core): Support IPv6 hosts in the DSN ([#2996](https://github.com/getsentry/sentry-javascript/pull/2996)) (#17708)
- feat(deps): Bump bundler plugins to ^4.6.1 ([#17980](https://github.com/getsentry/sentry-javascript/pull/17980))
- feat(nextjs): Emit warning for conflicting treeshaking / debug settings ([#18638](https://github.com/getsentry/sentry-javascript/pull/18638))
- feat(nextjs): Print Turbopack note for deprecated webpack options ([#18769](https://github.com/getsentry/sentry-javascript/pull/18769))
- feat(node-core): Add `isolateTrace` option to `node-cron` instrumentation ([#18416](https://github.com/getsentry/sentry-javascript/pull/18416))
- feat(node): Use `process.on('SIGTERM')` for flushing in Vercel functions ([#17583](https://github.com/getsentry/sentry-javascript/pull/17583))
- feat(nuxt): Detect development environment and add dev E2E test ([#18671](https://github.com/getsentry/sentry-javascript/pull/18671))
- fix(browser): Forward worker metadata for third-party error filtering ([#18756](https://github.com/getsentry/sentry-javascript/pull/18756))
- fix(browser): Reduce number of `visibilitystate` and `pagehide` listeners ([#18581](https://github.com/getsentry/sentry-javascript/pull/18581))
- fix(browser): Respect `tunnel` in `diagnoseSdkConnectivity` ([#18616](https://github.com/getsentry/sentry-javascript/pull/18616))
- fix(cloudflare): Consume body of fetch in the Cloudflare transport ([#18545](https://github.com/getsentry/sentry-javascript/pull/18545))
- fix(core): Set op on ended Vercel AI spans ([#18601](https://github.com/getsentry/sentry-javascript/pull/18601))
- fix(core): Subtract `performance.now()` from `browserPerformanceTimeOrigin` fallback ([#18715](https://github.com/getsentry/sentry-javascript/pull/18715))
- fix(core): Update client options to allow explicit `undefined` ([#18024](https://github.com/getsentry/sentry-javascript/pull/18024))
- fix(feedback): Fix cases where the outline of inputs were wrong ([#18647](https://github.com/getsentry/sentry-javascript/pull/18647))
- fix(next): Ensure inline sourcemaps are generated for wrapped modules in Dev ([#18640](https://github.com/getsentry/sentry-javascript/pull/18640))
- fix(next): Wrap all Random APIs with a safe runner ([#18700](https://github.com/getsentry/sentry-javascript/pull/18700))
- fix(nextjs): Avoid Edge build warning from OpenTelemetry `process.argv0` ([#18759](https://github.com/getsentry/sentry-javascript/pull/18759))
- fix(nextjs): Remove polynomial regular expression ([#18725](https://github.com/getsentry/sentry-javascript/pull/18725))
- fix(node-core): Ignore worker threads in OnUncaughtException ([#18689](https://github.com/getsentry/sentry-javascript/pull/18689))
- fix(node): relax Fastify's `setupFastifyErrorHandler` argument type ([#18620](https://github.com/getsentry/sentry-javascript/pull/18620))
- fix(nuxt): Allow overwriting server-side `defaultIntegrations` ([#18717](https://github.com/getsentry/sentry-javascript/pull/18717))
- fix(pino): Allow custom namespaces for `msg` and `err` ([#18597](https://github.com/getsentry/sentry-javascript/pull/18597))
- fix(react,solid,vue): Fix parametrization behavior for non-matched routes ([#18735](https://github.com/getsentry/sentry-javascript/pull/18735))
- fix(replay): Ensure replays contain canvas rendering when resumed after inactivity ([#18714](https://github.com/getsentry/sentry-javascript/pull/18714))
- fix(tracing): add gen_ai.request.messages.original_length attributes ([#18608](https://github.com/getsentry/sentry-javascript/pull/18608))
- ref(nextjs): Drop `resolve` dependency ([#18618](https://github.com/getsentry/sentry-javascript/pull/18618))
- ref(react-router): Use snake_case for span op names ([#18617](https://github.com/getsentry/sentry-javascript/pull/18617))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- chore(bun): Fix `install-bun.js` version check and improve upgrade feedback ([#18492](https://github.com/getsentry/sentry-javascript/pull/18492))
- chore(changelog): Fix typo ([#18648](https://github.com/getsentry/sentry-javascript/pull/18648))
- chore(craft): Use version templating for aws layer ([#18675](https://github.com/getsentry/sentry-javascript/pull/18675))
- chore(deps): Bump IITM to ^2.0.1 ([#18599](https://github.com/getsentry/sentry-javascript/pull/18599))
- chore(e2e-tests): Upgrade `@trpc/server` and `@trpc/client` ([#18722](https://github.com/getsentry/sentry-javascript/pull/18722))
- chore(e2e): Unpin react-router-7-framework-spa to ^7.11.0 ([#18551](https://github.com/getsentry/sentry-javascript/pull/18551))
- chore(nextjs): Bump next version in dev deps ([#18661](https://github.com/getsentry/sentry-javascript/pull/18661))
- chore(node-tests): Upgrade `@langchain/core` ([#18720](https://github.com/getsentry/sentry-javascript/pull/18720))
- chore(react): Inline `hoist-non-react-statics` package ([#18102](https://github.com/getsentry/sentry-javascript/pull/18102))
- chore(size-limit): Add size checks for metrics and logs ([#18573](https://github.com/getsentry/sentry-javascript/pull/18573))
- chore(tests): Add unordered mode to cloudflare test runner ([#18596](https://github.com/getsentry/sentry-javascript/pull/18596))
- ci(deps): bump actions/cache from 4 to 5 ([#18654](https://github.com/getsentry/sentry-javascript/pull/18654))
- ci(deps): Bump actions/create-github-app-token from 2.2.0 to 2.2.1 ([#18656](https://github.com/getsentry/sentry-javascript/pull/18656))
- ci(deps): bump actions/upload-artifact from 5 to 6 ([#18655](https://github.com/getsentry/sentry-javascript/pull/18655))
- ci(deps): bump peter-evans/create-pull-request from 7.0.9 to 8.0.0 ([#18657](https://github.com/getsentry/sentry-javascript/pull/18657))
- doc: E2E testing documentation updates ([#18649](https://github.com/getsentry/sentry-javascript/pull/18649))
- ref(core): Extract and reuse `getCombinedScopeData` helper ([#18585](https://github.com/getsentry/sentry-javascript/pull/18585))
- ref(core): Remove dependence between `performance.timeOrigin` and `performance.timing.navigationStart` ([#18710](https://github.com/getsentry/sentry-javascript/pull/18710))
- ref(core): Streamline and test `browserPerformanceTimeOrigin` ([#18708](https://github.com/getsentry/sentry-javascript/pull/18708))
- ref(core): Strengthen `browserPerformanceTimeOrigin` reliability check ([#18719](https://github.com/getsentry/sentry-javascript/pull/18719))
- ref(core): Use `serializeAttributes` for metric attribute serialization ([#18582](https://github.com/getsentry/sentry-javascript/pull/18582))
- ref(node): Remove duplicate function `isCjs` ([#18662](https://github.com/getsentry/sentry-javascript/pull/18662))
- test(core): Improve unit test performance for offline transport tests ([#18628](https://github.com/getsentry/sentry-javascript/pull/18628))
- test(core): Use fake timers in promisebuffer tests to ensure deterministic behavior ([#18659](https://github.com/getsentry/sentry-javascript/pull/18659))
- test(e2e): Add e2e metrics tests in Next.js 16 ([#18643](https://github.com/getsentry/sentry-javascript/pull/18643))
- test(e2e): Pin agents package in cloudflare-mcp test ([#18609](https://github.com/getsentry/sentry-javascript/pull/18609))
- test(e2e): Pin solid/vue tanstack router to 1.41.8 ([#18610](https://github.com/getsentry/sentry-javascript/pull/18610))
- test(nestjs): Add canary test for latest ([#18685](https://github.com/getsentry/sentry-javascript/pull/18685))
- test(node-native): Increase worker block timeout ([#18683](https://github.com/getsentry/sentry-javascript/pull/18683))
- test(nuxt): Fix nuxt-4 dev E2E test ([#18737](https://github.com/getsentry/sentry-javascript/pull/18737))
- test(tanstackstart-react): Add canary test for latest ([#18686](https://github.com/getsentry/sentry-javascript/pull/18686))
- test(vue): Added canary and latest test variants to Vue tests ([#18681](https://github.com/getsentry/sentry-javascript/pull/18681))

</details>

Work in this release was contributed by @G-Rath, @gianpaj, @maximepvrt, @Mohataseem89, @sebws, and @xgedev. Thank you for your contributions!

## 10.32.1

- fix(cloudflare): Add hono transaction name when error is thrown ([#18529](https://github.com/getsentry/sentry-javascript/pull/18529))
- fix(ember): Make `implementation` field optional (`hash` routes) ([#18564](https://github.com/getsentry/sentry-javascript/pull/18564))
- fix(vercelai): Fix input token count ([#18574](https://github.com/getsentry/sentry-javascript/pull/18574))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- chore(lint): prefer 'unknown' to 'any', fix lint warnings
- chore(test): Remove `cloudflare-astro` e2e test ([#18567](https://github.com/getsentry/sentry-javascript/pull/18567))

</details>

## 10.32.0

### Important Changes

- **feat(core): Apply scope attributes to logs ([#18184](https://github.com/getsentry/sentry-javascript/pull/18184))**

  You can now set attributes on the SDK's scopes which will be applied to all logs as long as the respective scopes are active. For the time being, only `string`, `number` and `boolean` attribute values are supported.

  ```ts
  Sentry.getGlobalScope().setAttributes({ is_admin: true, auth_provider: 'google' });

  Sentry.withScope(scope => {
    scope.setAttribute('step', 'authentication');

    // scope attributes `is_admin`, `auth_provider` and `step` are added
    Sentry.logger.info(`user ${user.id} logged in`, { activeSince: 100 });
    Sentry.logger.info(`updated ${user.id} last activity`);
  });

  // scope attributes `is_admin` and `auth_provider` are added
  Sentry.logger.warn('stale website version, reloading page');
  ```

- **feat(replay): Add Request body with `attachRawBodyFromRequest` option ([#18501](https://github.com/getsentry/sentry-javascript/pull/18501))**

  To attach the raw request body (from `Request` objects passed as the first `fetch` argument) to replay events, you can now use the `attachRawBodyFromRequest` option in the Replay integration:

  ```js
  Sentry.init({
    integrations: [
      Sentry.replayIntegration({
        attachRawBodyFromRequest: true,
      }),
    ],
  });
  ```

- **feat(tanstackstart-react): Trace server functions ([#18500](https://github.com/getsentry/sentry-javascript/pull/18500))**

  To enable tracing for server-side requests, you can now explicitly define a [server entry point](https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point) in your application and wrap your request handler with `wrapFetchWithSentry`.

  ```typescript
  // src/server.ts
  import { wrapFetchWithSentry } from '@sentry/tanstackstart-react';
  import handler, { createServerEntry } from '@tanstack/react-start/server-entry';

  export default createServerEntry(
    wrapFetchWithSentry({
      fetch(request: Request) {
        return handler.fetch(request);
      },
    }),
  );
  ```

- **feat(vue): Add TanStack Router integration ([#18547](https://github.com/getsentry/sentry-javascript/pull/18547))**

  The `@sentry/vue` package now includes support for TanStack Router. Use `tanstackRouterBrowserTracingIntegration` to automatically instrument pageload and navigation transactions with parameterized routes:

  ```javascript
  import { createApp } from 'vue';
  import { createRouter } from '@tanstack/vue-router';
  import * as Sentry from '@sentry/vue';
  import { tanstackRouterBrowserTracingIntegration } from '@sentry/vue/tanstackrouter';

  const router = createRouter({
    // your router config
  });

  Sentry.init({
    app,
    dsn: '__PUBLIC_DSN__',
    integrations: [tanstackRouterBrowserTracingIntegration(router)],
    tracesSampleRate: 1.0,
  });
  ```

### Other Changes

- feat(core): Capture initialize attributes on MCP servers ([#18531](https://github.com/getsentry/sentry-javascript/pull/18531))
- feat(nextjs): Extract tracing logic from server component wrapper templates ([#18408](https://github.com/getsentry/sentry-javascript/pull/18408))
- feat(nextjs): added webpack treeshaking flags as config ([#18359](https://github.com/getsentry/sentry-javascript/pull/18359))
- fix(solid/tanstackrouter): Ensure web vitals are sent on pageload ([#18542](https://github.com/getsentry/sentry-javascript/pull/18542))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- chore(changelog): Add entry for scope attributes ([#18555](https://github.com/getsentry/sentry-javascript/pull/18555))
- chore(changelog): Add entry for tanstack start wrapFetchWithSentry ([#18558](https://github.com/getsentry/sentry-javascript/pull/18558))
- chore(deps): bump @trpc/server from 10.45.2 to 10.45.3 in /dev-packages/e2e-tests/test-applications/node-express-incorrect-instrumentation ([#18530](https://github.com/getsentry/sentry-javascript/pull/18530))
- chore(deps): bump @trpc/server from 10.45.2 to 10.45.3 in /dev-packages/e2e-tests/test-applications/node-express-v5 ([#18550](https://github.com/getsentry/sentry-javascript/pull/18550))
- chore(e2e): Pin to react-router 7.10.1 in spa e2e test ([#18548](https://github.com/getsentry/sentry-javascript/pull/18548))
- chore(e2e): Remove check on `http.response_content_length_uncompressed` ([#18536](https://github.com/getsentry/sentry-javascript/pull/18536))
- chore(github): Add "Closes" to PR template ([#18538](https://github.com/getsentry/sentry-javascript/pull/18538))
- test(cloudflare-mcp): Unpin mcp sdk ([#18528](https://github.com/getsentry/sentry-javascript/pull/18528))
- test(nextjs): Add e2e tests for server component spans in next 16 ([#18544](https://github.com/getsentry/sentry-javascript/pull/18544))

</details>

## 10.31.0

### Important Changes

- **feat(browser): Add support for GraphQL persisted operations ([#18505](https://github.com/getsentry/sentry-javascript/pull/18505))**

The `graphqlClientIntegration` now supports GraphQL persisted operations (queries). When a persisted query is detected, the integration will capture the operation hash and version as span attributes:

- `graphql.persisted_query.hash.sha256` - The SHA-256 hash of the persisted query
- `graphql.persisted_query.version` - The version of the persisted query protocol

Additionally, the `graphql.document` attribute format has changed to align with OpenTelemetry semantic conventions. It now contains only the GraphQL query string instead of the full JSON request payload.

**Before:**

```javascript
"graphql.document": "{\"query\":\"query Test { user { id } }\"}"
```

**After:**

```javascript
"graphql.document": "query Test { user { id } }"
```

### Other Changes

- feat(node): Support `propagateTraceparent` option ([#18476](https://github.com/getsentry/sentry-javascript/pull/18476))
- feat(bun): Expose spotlight option in TypeScript ([#18436](https://github.com/getsentry/sentry-javascript/pull/18436))
- feat(core): Add additional exports for `captureException` and `captureMessage` parameter types ([#18521](https://github.com/getsentry/sentry-javascript/pull/18521))
- feat(core): Export `captureException` and `captureMessage` parameter types ([#18509](https://github.com/getsentry/sentry-javascript/pull/18509))
- feat(core): Parse individual cookies from cookie header ([#18325](https://github.com/getsentry/sentry-javascript/pull/18325))
- feat(node): Add instrument OpenAI export to node ([#18461](https://github.com/getsentry/sentry-javascript/pull/18461))
- feat(nuxt): Bump `@sentry/vite-plugin` and `@sentry/rollup-plugin` to 4.6.1 ([#18349](https://github.com/getsentry/sentry-javascript/pull/18349))
- feat(profiling): Add support for Node v24 in the prune script ([#18447](https://github.com/getsentry/sentry-javascript/pull/18447))
- feat(tracing): strip inline media from messages ([#18413](https://github.com/getsentry/sentry-javascript/pull/18413))
- feat(node): Add ESM support for postgres.js instrumentation ([#17961](https://github.com/getsentry/sentry-javascript/pull/17961))
- fix(browser): Stringify span context in linked traces log statement ([#18376](https://github.com/getsentry/sentry-javascript/pull/18376))
- fix(google-cloud-serverless): Move @types/express to optional peerDeps ([#18452](https://github.com/getsentry/sentry-javascript/pull/18452))
- fix(node-core): passthrough node-cron context ([#17835](https://github.com/getsentry/sentry-javascript/pull/17835))
- fix(tanstack-router): Check for `fromLocation` existence before reporting pageload ([#18463](https://github.com/getsentry/sentry-javascript/pull/18463))
- fix(tracing): add system prompt, model to google genai ([#18424](https://github.com/getsentry/sentry-javascript/pull/18424))
- fix(tracing): Set span operations for AI spans with model ID only ([#18471](https://github.com/getsentry/sentry-javascript/pull/18471))
- ref(browser): Improve profiling debug statement ([#18507](https://github.com/getsentry/sentry-javascript/pull/18507))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- chore: Add external contributor to CHANGELOG.md ([#18473](https://github.com/getsentry/sentry-javascript/pull/18473))
- chore: upgrade Playwright to ~1.56.0 for WSL2 compatibility ([#18468](https://github.com/getsentry/sentry-javascript/pull/18468))
- chore(bugbot): Add testing conventions code review rules ([#18433](https://github.com/getsentry/sentry-javascript/pull/18433))
- chore(deps): bump next from 14.2.25 to 14.2.35 in /dev-packages/e2e-tests/test-applications/create-next-app ([#18494](https://github.com/getsentry/sentry-javascript/pull/18494))
- chore(deps): bump next from 14.2.32 to 14.2.35 in /dev-packages/e2e-tests/test-applications/nextjs-orpc ([#18520](https://github.com/getsentry/sentry-javascript/pull/18520))
- chore(deps): bump next from 14.2.32 to 14.2.35 in /dev-packages/e2e-tests/test-applications/nextjs-pages-dir ([#18496](https://github.com/getsentry/sentry-javascript/pull/18496))
- chore(deps): bump next from 15.5.7 to 15.5.9 in /dev-packages/e2e-tests/test-applications/nextjs-15 ([#18482](https://github.com/getsentry/sentry-javascript/pull/18482))
- chore(deps): bump next from 15.5.7 to 15.5.9 in /dev-packages/e2e-tests/test-applications/nextjs-15-intl ([#18483](https://github.com/getsentry/sentry-javascript/pull/18483))
- chore(deps): bump next from 16.0.7 to 16.0.9 in /dev-packages/e2e-tests/test-applications/nextjs-16 ([#18480](https://github.com/getsentry/sentry-javascript/pull/18480))
- chore(deps): bump next from 16.0.7 to 16.0.9 in /dev-packages/e2e-tests/test-applications/nextjs-16-cacheComponents ([#18479](https://github.com/getsentry/sentry-javascript/pull/18479))
- chore(deps): bump next from 16.0.7 to 16.0.9 in /dev-packages/e2e-tests/test-applications/nextjs-16-tunnel ([#18481](https://github.com/getsentry/sentry-javascript/pull/18481))
- chore(deps): bump next from 16.0.9 to 16.0.10 in /dev-packages/e2e-tests/test-applications/nextjs-16 ([#18514](https://github.com/getsentry/sentry-javascript/pull/18514))
- chore(deps): bump next from 16.0.9 to 16.0.10 in /dev-packages/e2e-tests/test-applications/nextjs-16-tunnel ([#18487](https://github.com/getsentry/sentry-javascript/pull/18487))
- chore(tests): Added test variant flag ([#18458](https://github.com/getsentry/sentry-javascript/pull/18458))
- test(cloudflare-mcp): Pin mcp sdk to 1.24.0 ([#18524](https://github.com/getsentry/sentry-javascript/pull/18524))

</details>

Work in this release was contributed by @sebws and @TBeeren. Thank you for your contributions!

## 10.30.0

- feat(nextjs): Deprecate Webpack top-level options ([#18343](https://github.com/getsentry/sentry-javascript/pull/18343))
- feat(node): Capture scope when event loop blocked ([#18040](https://github.com/getsentry/sentry-javascript/pull/18040))
- fix(aws-serverless): Remove hyphens from AWS-lambda origins ([#18353](https://github.com/getsentry/sentry-javascript/pull/18353))
- fix(core): Parse method from Request object in fetch ([#18453](https://github.com/getsentry/sentry-javascript/pull/18453))
- fix(react): Add transaction name guards for rapid lazy-route navigations ([#18346](https://github.com/getsentry/sentry-javascript/pull/18346))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- chore(ci): Fix double issue creation for unreferenced PRs ([#18442](https://github.com/getsentry/sentry-javascript/pull/18442))
- chore(deps): bump next from 15.5.4 to 15.5.7 in /dev-packages/e2e-tests/test-applications/nextjs-15 ([#18411](https://github.com/getsentry/sentry-javascript/pull/18411))
- chore(deps): bump next from 15.5.4 to 15.5.7 in /dev-packages/e2e-tests/test-applications/nextjs-15-intl ([#18400](https://github.com/getsentry/sentry-javascript/pull/18400))
- chore(deps): bump next from 16.0.0 to 16.0.7 in /dev-packages/e2e-tests/test-applications/nextjs-16 ([#18399](https://github.com/getsentry/sentry-javascript/pull/18399))
- chore(deps): bump next from 16.0.0 to 16.0.7 in /dev-packages/e2e-tests/test-applications/nextjs-16-cacheComponents ([#18427](https://github.com/getsentry/sentry-javascript/pull/18427))
- chore(deps): bump next from 16.0.0 to 16.0.7 in /dev-packages/e2e-tests/test-applications/nextjs-16-tunnel ([#18439](https://github.com/getsentry/sentry-javascript/pull/18439))
- chore(publish): Fix publish order for `@sentry/types` ([#18429](https://github.com/getsentry/sentry-javascript/pull/18429))
- ci(deps): bump actions/create-github-app-token from 2.1.4 to 2.2.0 ([#18362](https://github.com/getsentry/sentry-javascript/pull/18362))

</details>

## 10.29.0

### Important Changes

- **feat(solid|solidstart): Bump accepted @solidjs/router range ([#18395](https://github.com/getsentry/sentry-javascript/pull/18395))**

We expanded the supported version range for `@solidjs/router` to include `0.14.x` and `0.15.x` versions.

### Other Changes

- fix(logs): Add support for `msg` in pino integration ([#18389](https://github.com/getsentry/sentry-javascript/pull/18389))
- fix(node): Include system message in anthropic-ai messages span ([#18332](https://github.com/getsentry/sentry-javascript/pull/18332))
- fix(tracing): Add missing attributes in vercel-ai spans ([#18333](https://github.com/getsentry/sentry-javascript/pull/18333))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- chore(tanstackstart-react): clean up re-exported types ([#18393](https://github.com/getsentry/sentry-javascript/pull/18393))
- ref(core): Avoid looking up openai integration options ([#17695](https://github.com/getsentry/sentry-javascript/pull/17695))
- test(nuxt): Relax captured unhandled error assertion ([#18397](https://github.com/getsentry/sentry-javascript/pull/18397))
- test(tanstackstart-react): Set up E2E test application ([#18358](https://github.com/getsentry/sentry-javascript/pull/18358))

</details>

## 10.28.0

### Important Changes

- **feat(core): Make `matcher` parameter optional in `makeMultiplexedTransport` ([#10798](https://github.com/getsentry/sentry-javascript/pull/10798))**

The `matcher` parameter in `makeMultiplexedTransport` is now optional with a sensible default. This makes it much easier to use the multiplexed transport for sending events to multiple DSNs based on runtime configuration.

**Before:**

```javascript
import { makeFetchTransport, makeMultiplexedTransport } from '@sentry/browser';

const EXTRA_KEY = 'ROUTE_TO';

const transport = makeMultiplexedTransport(makeFetchTransport, args => {
  const event = args.getEvent();
  if (event?.extra?.[EXTRA_KEY] && Array.isArray(event.extra[EXTRA_KEY])) {
    return event.extra[EXTRA_KEY];
  }
  return [];
});

Sentry.init({
  transport,
  // ... other options
});

// Capture events with routing info
Sentry.captureException(error, {
  extra: {
    [EXTRA_KEY]: [
      { dsn: 'https://key1@sentry.io/project1', release: 'v1.0.0' },
      { dsn: 'https://key2@sentry.io/project2' },
    ],
  },
});
```

**After:**

```javascript
import { makeFetchTransport, makeMultiplexedTransport, MULTIPLEXED_TRANSPORT_EXTRA_KEY } from '@sentry/browser';

// Just pass the transport generator - the default matcher handles the rest!
Sentry.init({
  transport: makeMultiplexedTransport(makeFetchTransport),
  // ... other options
});

// Capture events with routing info using the exported constant
Sentry.captureException(error, {
  extra: {
    [MULTIPLEXED_TRANSPORT_EXTRA_KEY]: [
      { dsn: 'https://key1@sentry.io/project1', release: 'v1.0.0' },
      { dsn: 'https://key2@sentry.io/project2' },
    ],
  },
});
```

The default matcher looks for routing information in `event.extra[MULTIPLEXED_TRANSPORT_EXTRA_KEY]`. You can still provide a custom matcher function for advanced use cases.

- **feat(nextjs): Support cacheComponents on turbopack ([#18304](https://github.com/getsentry/sentry-javascript/pull/18304))**

This release adds support for `cacheComponents` on turbopack builds. We are working on adding support for this feature in webpack builds as well.

### Other Changes

- feat: Publish AWS Lambda Layer for Node 24 ([#18327](https://github.com/getsentry/sentry-javascript/pull/18327))
- feat(browser): Expose langchain instrumentation ([#18342](https://github.com/getsentry/sentry-javascript/pull/18342))
- feat(browser): Expose langgraph instrumentation ([#18345](https://github.com/getsentry/sentry-javascript/pull/18345))
- feat(cloudflare): Allow specifying a custom fetch in Cloudflare transport options ([#18335](https://github.com/getsentry/sentry-javascript/pull/18335))
- feat(core): Add `isolateTrace` option to `Sentry.withMonitor()` ([#18079](https://github.com/getsentry/sentry-javascript/pull/18079))
- feat(deps): bump @sentry/webpack-plugin from 4.3.0 to 4.6.1 ([#18272](https://github.com/getsentry/sentry-javascript/pull/18272))
- feat(nextjs): Add cloudflare `waitUntil` detection ([#18336](https://github.com/getsentry/sentry-javascript/pull/18336))
- feat(node): Add LangChain v1 support ([#18306](https://github.com/getsentry/sentry-javascript/pull/18306))
- feat(remix): Add parameterized transaction naming for routes ([#17951](https://github.com/getsentry/sentry-javascript/pull/17951))
- fix(cloudflare): Keep http root span alive until streaming responses are consumed ([#18087](https://github.com/getsentry/sentry-javascript/pull/18087))
- fix(cloudflare): Wait for async events to finish ([#18334](https://github.com/getsentry/sentry-javascript/pull/18334))
- fix(core): `continueTrace` doesn't propagate given trace ID if active span exists ([#18328](https://github.com/getsentry/sentry-javascript/pull/18328))
- fix(node-core): Handle custom scope in log messages without parameters ([#18322](https://github.com/getsentry/sentry-javascript/pull/18322))
- fix(opentelemetry): Ensure Sentry spans don't leak when tracing is disabled ([#18337](https://github.com/getsentry/sentry-javascript/pull/18337))
- fix(react-router): Use underscores in trace origin values ([#18351](https://github.com/getsentry/sentry-javascript/pull/18351))
- chore(tanstackstart-react): Export custom inits from tanstackstart-react ([#18369](https://github.com/getsentry/sentry-javascript/pull/18369))
- chore(tanstackstart-react)!: Remove empty placeholder implementations ([#18338](https://github.com/getsentry/sentry-javascript/pull/18338))

<details>
  <summary><strong>Internal Changes</strong></summary>

- chore: Allow URLs as issue ([#18372](https://github.com/getsentry/sentry-javascript/pull/18372))
- chore(changelog): Add entry for [#18304](https://github.com/getsentry/sentry-javascript/pull/18304) ([#18329](https://github.com/getsentry/sentry-javascript/pull/18329))
- chore(ci): Add action to track all PRs as issues ([#18363](https://github.com/getsentry/sentry-javascript/pull/18363))
- chore(github): Adjust `BUGBOT.md` rules to flag invalid op and origin values during review ([#18352](https://github.com/getsentry/sentry-javascript/pull/18352))
- ci: Add action to create issue on gitflow merge conflicts ([#18319](https://github.com/getsentry/sentry-javascript/pull/18319))
- ci(deps): bump actions/checkout from 5 to 6 ([#18268](https://github.com/getsentry/sentry-javascript/pull/18268))
- ci(deps): bump peter-evans/create-pull-request from 7.0.8 to 7.0.9 ([#18361](https://github.com/getsentry/sentry-javascript/pull/18361))
- test(cloudflare): Add typechecks for cloudflare-worker e2e test ([#18321](https://github.com/getsentry/sentry-javascript/pull/18321))

</details>

## 10.27.0

### Important Changes

- **feat(deps): Bump OpenTelemetry ([#18239](https://github.com/getsentry/sentry-javascript/pull/18239))**
  - Bump @opentelemetry/context-async-hooks from ^2.1.0 to ^2.2.0
  - Bump @opentelemetry/core from ^2.1.0 to ^2.2.0
  - Bump @opentelemetry/resources from ^2.1.0 to ^2.2.0
  - Bump @opentelemetry/sdk-trace-base from ^2.1.0 to ^2.2.0
  - Bump @opentelemetry/sdk-trace-node from ^2.1.0 to ^2.2.0
  - Bump @opentelemetry/instrumentation from 0.204.0 to 0.208.0
  - Bump @opentelemetry/instrumentation-amqplib from 0.51.0 to 0.55.0
  - Bump @opentelemetry/instrumentation-aws-sdk from 0.59.0 to 0.64.0
  - Bump @opentelemetry/instrumentation-connect from 0.48.0 to 0.52.0
  - Bump @opentelemetry/instrumentation-dataloader from 0.22.0 to 0.26.0
  - Bump @opentelemetry/instrumentation-express from 0.53.0 to 0.57.0
  - Bump @opentelemetry/instrumentation-fs from 0.24.0 to 0.28.0
  - Bump @opentelemetry/instrumentation-generic-pool from 0.48.0 to 0.52.0
  - Bump @opentelemetry/instrumentation-graphql from 0.52.0 to 0.56.0
  - Bump @opentelemetry/instrumentation-hapi from 0.51.0 to 0.55.0
  - Bump @opentelemetry/instrumentation-http from 0.204.0 to 0.208.0
  - Bump @opentelemetry/instrumentation-ioredis from 0.52.0 to 0.56.0
  - Bump @opentelemetry/instrumentation-kafkajs from 0.14.0 to 0.18.0
  - Bump @opentelemetry/instrumentation-knex from 0.49.0 to 0.53.0
  - Bump @opentelemetry/instrumentation-koa from 0.52.0 to 0.57.0
  - Bump @opentelemetry/instrumentation-lru-memoizer from 0.49.0 to 0.53.0
  - Bump @opentelemetry/instrumentation-mongodb from 0.57.0 to 0.61.0
  - Bump @opentelemetry/instrumentation-mongoose from 0.51.0 to 0.55.0
  - Bump @opentelemetry/instrumentation-mysql from 0.50.0 to 0.54.0
  - Bump @opentelemetry/instrumentation-mysql2 from 0.51.0 to 0.55.0
  - Bump @opentelemetry/instrumentation-nestjs-core from 0.50.0 to 0.55.0
  - Bump @opentelemetry/instrumentation-pg from 0.57.0 to 0.61.0
  - Bump @opentelemetry/instrumentation-redis from 0.53.0 to 0.57.0
  - Bump @opentelemetry/instrumentation-tedious from 0.23.0 to 0.27.0
  - Bump @opentelemetry/instrumentation-undici from 0.15.0 to 0.19.0
  - Bump @prisma/instrumentation from 6.15.0 to 6.19.0

- **feat(browserprofiling): Add `manual` mode and deprecate old profiling ([#18189](https://github.com/getsentry/sentry-javascript/pull/18189))**

  Adds the `manual` lifecycle mode for UI profiling (the default mode), allowing profiles to be captured manually with `Sentry.uiProfiler.startProfiler()` and `Sentry.uiProfiler.stopProfiler()`.
  The previous transaction-based profiling is with `profilesSampleRate` is now deprecated in favor of the new UI Profiling with `profileSessionSampleRate`.

### Other Changes

- feat(core): Add `gibibyte` and `pebibyte` to `InformationUnit` type ([#18241](https://github.com/getsentry/sentry-javascript/pull/18241))
- feat(core): Add scope attribute APIs ([#18165](https://github.com/getsentry/sentry-javascript/pull/18165))
- feat(core): Re-add `_experiments.enableLogs` option ([#18299](https://github.com/getsentry/sentry-javascript/pull/18299))
- feat(core): Use `maxValueLength` on error messages ([#18301](https://github.com/getsentry/sentry-javascript/pull/18301))
- feat(deps): bump @sentry/bundler-plugin-core from 4.3.0 to 4.6.1 ([#18273](https://github.com/getsentry/sentry-javascript/pull/18273))
- feat(deps): bump @sentry/cli from 2.56.0 to 2.58.2 ([#18271](https://github.com/getsentry/sentry-javascript/pull/18271))
- feat(node): Add tracing support for AzureOpenAI ([#18281](https://github.com/getsentry/sentry-javascript/pull/18281))
- feat(node): Fix local variables capturing for out-of-app frames ([#18245](https://github.com/getsentry/sentry-javascript/pull/18245))
- fix(core): Add a PromiseBuffer for incoming events on the client ([#18120](https://github.com/getsentry/sentry-javascript/pull/18120))
- fix(core): Always redact content of sensitive headers regardless of `sendDefaultPii` ([#18311](https://github.com/getsentry/sentry-javascript/pull/18311))
- fix(metrics): Update return type of `beforeSendMetric` ([#18261](https://github.com/getsentry/sentry-javascript/pull/18261))
- fix(nextjs): universal random tunnel path support ([#18257](https://github.com/getsentry/sentry-javascript/pull/18257))
- ref(react): Add more guarding against wildcards in lazy route transactions ([#18155](https://github.com/getsentry/sentry-javascript/pull/18155))
- chore(deps): bump glob from 11.0.1 to 11.1.0 in /packages/react-router ([#18243](https://github.com/getsentry/sentry-javascript/pull/18243))

<details>
  <summary> <strong>Internal Changes</strong> </summary>
    - build(deps): bump hono from 4.9.7 to 4.10.3 in /dev-packages/e2e-tests/test-applications/cloudflare-hono ([#18038](https://github.com/getsentry/sentry-javascript/pull/18038))
    - chore: Add `bump_otel_instrumentations` cursor command ([#18253](https://github.com/getsentry/sentry-javascript/pull/18253))
    - chore: Add external contributor to CHANGELOG.md ([#18297](https://github.com/getsentry/sentry-javascript/pull/18297))
    - chore: Add external contributor to CHANGELOG.md ([#18300](https://github.com/getsentry/sentry-javascript/pull/18300))
    - chore: Do not update opentelemetry ([#18254](https://github.com/getsentry/sentry-javascript/pull/18254))
    - chore(angular): Add Angular 21 Support ([#18274](https://github.com/getsentry/sentry-javascript/pull/18274))
    - chore(deps): bump astro from 4.16.18 to 5.15.9 in /dev-packages/e2e-tests/test-applications/cloudflare-astro ([#18259](https://github.com/getsentry/sentry-javascript/pull/18259))
    - chore(dev-deps): Update some dev dependencies ([#17816](https://github.com/getsentry/sentry-javascript/pull/17816))
    - ci(deps): Bump actions/create-github-app-token from 2.1.1 to 2.1.4 ([#17825](https://github.com/getsentry/sentry-javascript/pull/17825))
    - ci(deps): bump actions/setup-node from 4 to 6 ([#18077](https://github.com/getsentry/sentry-javascript/pull/18077))
    - ci(deps): bump actions/upload-artifact from 4 to 5 ([#18075](https://github.com/getsentry/sentry-javascript/pull/18075))
    - ci(deps): bump github/codeql-action from 3 to 4 ([#18076](https://github.com/getsentry/sentry-javascript/pull/18076))
    - doc(sveltekit): Update documentation link for SvelteKit guide ([#18298](https://github.com/getsentry/sentry-javascript/pull/18298))
    - test(e2e): Fix astro config in test app ([#18282](https://github.com/getsentry/sentry-javascript/pull/18282))
    - test(nextjs): Remove debug logs from e2e test ([#18250](https://github.com/getsentry/sentry-javascript/pull/18250))
</details>

Work in this release was contributed by @bignoncedric and @adam-kov. Thank you for your contributions!

## 10.26.0

### Important Changes

- **feat(core): Instrument LangGraph Agent ([#18114](https://github.com/getsentry/sentry-javascript/pull/18114))**

Adds support for instrumenting LangGraph StateGraph operations in Node. The LangGraph integration can be configured as follows:

```js
Sentry.init({
  dsn: '__DSN__',
  sendDefaultPii: false, // Even with PII disabled globally
  integrations: [
    Sentry.langGraphIntegration({
      recordInputs: true, // Force recording input messages
      recordOutputs: true, // Force recording response text
    }),
  ],
});
```

- **feat(cloudflare/vercel-edge): Add manual instrumentation for LangGraph ([#18112](https://github.com/getsentry/sentry-javascript/pull/18112))**

Instrumentation for LangGraph in Cloudflare Workers and Vercel Edge environments is supported by manually calling `instrumentLangGraph`:

```js
import * as Sentry from '@sentry/cloudflare'; // or '@sentry/vercel-edge'
import { StateGraph, START, END, MessagesAnnotation } from '@langchain/langgraph';

// Create and instrument the graph
const graph = new StateGraph(MessagesAnnotation)
  .addNode('agent', agentFn)
  .addEdge(START, 'agent')
  .addEdge('agent', END);

Sentry.instrumentLangGraph(graph, {
  recordInputs: true,
  recordOutputs: true,
});

const compiled = graph.compile({ name: 'weather_assistant' });

await compiled.invoke({
  messages: [{ role: 'user', content: 'What is the weather in SF?' }],
});
```

- **feat(node): Add OpenAI SDK v6 support ([#18244](https://github.com/getsentry/sentry-javascript/pull/18244))**

### Other Changes

- feat(core): Support OpenAI embeddings API ([#18224](https://github.com/getsentry/sentry-javascript/pull/18224))
- feat(browser-utils): bump web-vitals to 5.1.0 ([#18091](https://github.com/getsentry/sentry-javascript/pull/18091))
- feat(core): Support truncation for LangChain integration request messages ([#18157](https://github.com/getsentry/sentry-javascript/pull/18157))
- feat(metrics): Add default `server.address` attribute on server runtimes ([#18242](https://github.com/getsentry/sentry-javascript/pull/18242))
- feat(nextjs): Add URL to server-side transaction events ([#18230](https://github.com/getsentry/sentry-javascript/pull/18230))
- feat(node-core): Add mechanism to prevent wrapping ai providers multiple times([#17972](https://github.com/getsentry/sentry-javascript/pull/17972))
- feat(replay): Bump limit for minReplayDuration ([#18190](https://github.com/getsentry/sentry-javascript/pull/18190))
- fix(browser): Add `ok` status to successful `idleSpan`s ([#18139](https://github.com/getsentry/sentry-javascript/pull/18139))
- fix(core): Check `fetch` support with data URL ([#18225](https://github.com/getsentry/sentry-javascript/pull/18225))
- fix(core): Decrease number of Sentry stack frames for messages from `captureConsoleIntegration` ([#18096](https://github.com/getsentry/sentry-javascript/pull/18096))
- fix(core): Emit processed metric ([#18222](https://github.com/getsentry/sentry-javascript/pull/18222))
- fix(core): Ensure logs past `MAX_LOG_BUFFER_SIZE` are not swallowed ([#18207](https://github.com/getsentry/sentry-javascript/pull/18207))
- fix(core): Ensure metrics past `MAX_METRIC_BUFFER_SIZE` are not swallowed ([#18212](https://github.com/getsentry/sentry-javascript/pull/18212))
- fix(core): Fix logs and metrics flush timeout starvation with continuous logging ([#18211](https://github.com/getsentry/sentry-javascript/pull/18211))
- fix(core): Flatten gen_ai.request.available_tools in google-genai ([#18194](https://github.com/getsentry/sentry-javascript/pull/18194))
- fix(core): Stringify available tools sent from vercelai ([#18197](https://github.com/getsentry/sentry-javascript/pull/18197))
- fix(core/vue): Detect and skip normalizing Vue `VNode` objects with high `normalizeDepth` ([#18206](https://github.com/getsentry/sentry-javascript/pull/18206))
- fix(nextjs): Avoid wrapping middleware files when in standalone mode ([#18172](https://github.com/getsentry/sentry-javascript/pull/18172))
- fix(nextjs): Drop meta trace tags if rendered page is ISR ([#18192](https://github.com/getsentry/sentry-javascript/pull/18192))
- fix(nextjs): Respect PORT variable for dev error symbolication ([#18227](https://github.com/getsentry/sentry-javascript/pull/18227))
- fix(nextjs): use LRU map instead of map for ISR route cache ([#18234](https://github.com/getsentry/sentry-javascript/pull/18234))
- fix(node): `tracingChannel` export missing in older node versions ([#18191](https://github.com/getsentry/sentry-javascript/pull/18191))
- fix(node): Fix Spotlight configuration precedence to match specification ([#18195](https://github.com/getsentry/sentry-javascript/pull/18195))
- fix(react): Prevent navigation span leaks for consecutive navigations ([#18098](https://github.com/getsentry/sentry-javascript/pull/18098))
- ref(react-router): Deprecate ErrorBoundary exports ([#18208](https://github.com/getsentry/sentry-javascript/pull/18208))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- chore: Fix missing changelog quote we use for attribution placement ([#18237](https://github.com/getsentry/sentry-javascript/pull/18237))
- chore: move tip about prioritizing issues ([#18071](https://github.com/getsentry/sentry-javascript/pull/18071))
- chore(e2e): Pin `@embroider/addon-shim` to 1.10.0 for the e2e ember-embroider ([#18173](https://github.com/getsentry/sentry-javascript/pull/18173))
- chore(react-router): Fix casing on deprecation notices ([#18221](https://github.com/getsentry/sentry-javascript/pull/18221))
- chore(test): Use correct `testTimeout` field in bundler-tests vitest config
- chore(e2e): Bump zod in e2e tests ([#18251](https://github.com/getsentry/sentry-javascript/pull/18251))
- test(browser-integration): Fix incorrect tag value assertions ([#18162](https://github.com/getsentry/sentry-javascript/pull/18162))
- test(profiling): Add test utils to validate Profile Chunk envelope ([#18170](https://github.com/getsentry/sentry-javascript/pull/18170))
- ref(e2e-ember): Remove `@embroider/addon-shim` override ([#18180](https://github.com/getsentry/sentry-javascript/pull/18180))
- ref(browser): Move trace lifecycle listeners to class function ([#18231](https://github.com/getsentry/sentry-javascript/pull/18231))
- ref(browserprofiling): Move and rename profiler class to UIProfiler ([#18187](https://github.com/getsentry/sentry-javascript/pull/18187))
- ref(core): Move ai integrations from utils to tracing ([#18185](https://github.com/getsentry/sentry-javascript/pull/18185))
- ref(core): Optimize `Scope.setTag` bundle size and adjust test ([#18182](https://github.com/getsentry/sentry-javascript/pull/18182))

</details>

## 10.25.0

- feat(browser): Include Spotlight in development bundles ([#18078](https://github.com/getsentry/sentry-javascript/pull/18078))
- feat(cloudflare): Add metrics exports ([#18147](https://github.com/getsentry/sentry-javascript/pull/18147))
- feat(core): Truncate request string inputs in OpenAI integration ([#18136](https://github.com/getsentry/sentry-javascript/pull/18136))
- feat(metrics): Add missing metric node exports ([#18149](https://github.com/getsentry/sentry-javascript/pull/18149))
- feat(node): Add `maxCacheKeyLength` to Redis integration (remove truncation) ([#18045](https://github.com/getsentry/sentry-javascript/pull/18045))
- feat(vercel-edge): Add metrics export ([#18148](https://github.com/getsentry/sentry-javascript/pull/18148))
- fix(core): Only consider exception mechanism when updating session status from event with exceptions ([#18137](https://github.com/getsentry/sentry-javascript/pull/18137))
- ref(browser): Remove truncation when not needed ([#18051](https://github.com/getsentry/sentry-javascript/pull/18051))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- chore(build): Fix incorrect versions after merge ([#18154](https://github.com/getsentry/sentry-javascript/pull/18154))
</details>

## 10.24.0

### Important Changes

- **feat(metrics): Add top level option `enableMetrics` and `beforeSendMetric` ([#18088](https://github.com/getsentry/sentry-javascript/pull/18088))**

  This PR moves `enableMetrics` and `beforeSendMetric` out of the `_experiments` options.
  The metrics feature will now be **enabled by default** (none of our integrations will auto-emit metrics as of now), but you can disable sending metrics via `enableMetrics: false`.
  Metric options within `_experiments` got deprecated but will still work as of now, they will be removed with the next major version of our SDKs.

### Other Changes

- feat(aws): Add `SENTRY_LAYER_EXTENSION` to configure using the lambda layer extension via env variables ([#18101](https://github.com/getsentry/sentry-javascript/pull/18101))
- feat(core): Include all exception object keys instead of truncating ([#18044](https://github.com/getsentry/sentry-javascript/pull/18044))
- feat(metrics)!: Update types ([#17907](https://github.com/getsentry/sentry-javascript/pull/17907))
- feat(replay): ignore `background-image` when `blockAllMedia` is enabled ([#18019](https://github.com/getsentry/sentry-javascript/pull/18019))
- fix(nextjs): Delete css map files ([#18131](https://github.com/getsentry/sentry-javascript/pull/18131))
- fix(nextjs): Stop accessing sync props in template ([#18113](https://github.com/getsentry/sentry-javascript/pull/18113))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- chore: X handle update ([#18117](https://github.com/getsentry/sentry-javascript/pull/18117))
- chore(eslint): Add eslint-plugin-regexp rule (dev-packages) ([#18063](https://github.com/getsentry/sentry-javascript/pull/18063))
- test(next): fix flakey tests ([#18100](https://github.com/getsentry/sentry-javascript/pull/18100))
- test(node-core): Proof that withMonitor doesn't create a new trace ([#18057](https://github.com/getsentry/sentry-javascript/pull/18057))
</details>

## 10.23.0

- feat(core): Send `user-agent` header with envelope requests in server SDKs ([#17929](https://github.com/getsentry/sentry-javascript/pull/17929))
- feat(browser): Limit transport buffer size ([#18046](https://github.com/getsentry/sentry-javascript/pull/18046))
- feat(core): Remove default value of `maxValueLength: 250` ([#18043](https://github.com/getsentry/sentry-javascript/pull/18043))
- feat(react-router): Align options with shared build time options type ([#18014](https://github.com/getsentry/sentry-javascript/pull/18014))
- fix(browser-utils): cache element names for INP ([#18052](https://github.com/getsentry/sentry-javascript/pull/18052))
- fix(browser): Capture unhandled rejection errors for web worker integration ([#18054](https://github.com/getsentry/sentry-javascript/pull/18054))
- fix(cloudflare): Ensure types for cloudflare handlers ([#18064](https://github.com/getsentry/sentry-javascript/pull/18064))
- fix(nextjs): Update proxy template wrapping ([#18086](https://github.com/getsentry/sentry-javascript/pull/18086))
- fix(nuxt): Added top-level fallback exports ([#18083](https://github.com/getsentry/sentry-javascript/pull/18083))
- fix(nuxt): check for H3 error cause before re-capturing ([#18035](https://github.com/getsentry/sentry-javascript/pull/18035))
- fix(replay): Linked errors not resetting session id ([#17854](https://github.com/getsentry/sentry-javascript/pull/17854))
- fix(tracemetrics): Bump metrics buffer to 1k ([#18039](https://github.com/getsentry/sentry-javascript/pull/18039))
- fix(vue): Make `options` parameter optional on `attachErrorHandler` ([#18072](https://github.com/getsentry/sentry-javascript/pull/18072))
- ref(core): Set span status `internal_error` instead of `unknown_error` ([#17909](https://github.com/getsentry/sentry-javascript/pull/17909))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- fix(tests): un-override nitro dep version for nuxt-3 test ([#18056](https://github.com/getsentry/sentry-javascript/pull/18056))
- fix(e2e): Add p-map override to fix React Router 7 test builds ([#18068](https://github.com/getsentry/sentry-javascript/pull/18068))
- feat: Add a note to save changes before starting ([#17987](https://github.com/getsentry/sentry-javascript/pull/17987))
- test(browser): Add test for INP target name after navigation or DOM changes ([#18033](https://github.com/getsentry/sentry-javascript/pull/18033))
- chore: Add external contributor to CHANGELOG.md ([#18032](https://github.com/getsentry/sentry-javascript/pull/18032))
- chore(aws-serverless): Fix typo in timeout warning function name ([#18031](https://github.com/getsentry/sentry-javascript/pull/18031))
- chore(browser): upgrade fake-indexeddb to v6 ([#17975](https://github.com/getsentry/sentry-javascript/pull/17975))
- chore(tests): pass test flags through to the test command ([#18062](https://github.com/getsentry/sentry-javascript/pull/18062))

</details>

Work in this release was contributed by @hanseo0507. Thank you for your contribution!

## 10.22.0

### Important Changes

- **feat(node): Instrument cloud functions for firebase v2 ([#17952](https://github.com/getsentry/sentry-javascript/pull/17952))**

  We added instrumentation for Cloud Functions for Firebase v2, enabling automatic performance tracking and error monitoring. This will be added automatically if you have enabled tracing.

- **feat(core): Instrument LangChain AI ([#17955](https://github.com/getsentry/sentry-javascript/pull/17955))**

  Instrumentation was added for LangChain AI operations. You can configure what is recorded like this:

  ```ts
  Sentry.init({
    integrations: [
      Sentry.langChainIntegration({
        recordInputs: true, // Record prompts/messages
        recordOutputs: true, // Record responses
      }),
    ],
  });
  ```

### Other Changes

- feat(cloudflare,vercel-edge): Add support for LangChain instrumentation ([#17986](https://github.com/getsentry/sentry-javascript/pull/17986))
- feat: Align sentry origin with documentation ([#17998](https://github.com/getsentry/sentry-javascript/pull/17998))
- feat(core): Truncate request messages in AI integrations ([#17921](https://github.com/getsentry/sentry-javascript/pull/17921))
- feat(nextjs): Support node runtime on proxy files ([#17995](https://github.com/getsentry/sentry-javascript/pull/17995))
- feat(node): Pass requestHook and responseHook option to OTel ([#17996](https://github.com/getsentry/sentry-javascript/pull/17996))
- fix(core): Fix wrong async types when instrumenting anthropic's stream api ([#18007](https://github.com/getsentry/sentry-javascript/pull/18007))
- fix(nextjs): Remove usage of chalk to avoid runtime errors ([#18010](https://github.com/getsentry/sentry-javascript/pull/18010))
- fix(node): Pino capture serialized `err` ([#17999](https://github.com/getsentry/sentry-javascript/pull/17999))
- fix(node): Pino child loggers ([#17934](https://github.com/getsentry/sentry-javascript/pull/17934))
- fix(react): Don't trim index route `/` when getting pathname ([#17985](https://github.com/getsentry/sentry-javascript/pull/17985))
- fix(react): Patch `spanEnd` for potentially cancelled lazy-route transactions ([#17962](https://github.com/getsentry/sentry-javascript/pull/17962))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- chore: Add required size_check for GH Actions ([#18009](https://github.com/getsentry/sentry-javascript/pull/18009))
- chore: Upgrade madge to v8 ([#17957](https://github.com/getsentry/sentry-javascript/pull/17957))
- test(hono): Fix hono e2e tests ([#18000](https://github.com/getsentry/sentry-javascript/pull/18000))
- test(react-router): Fix `getMetaTagTransformer` tests for Vitest compatibility ([#18013](https://github.com/getsentry/sentry-javascript/pull/18013))
- test(react): Add parameterized route tests for `createHashRouter` ([#17789](https://github.com/getsentry/sentry-javascript/pull/17789))

</details>

## 10.21.0

### Important Changes

- **feat(browserProfiling): Add `trace` lifecycle mode for UI profiling ([#17619](https://github.com/getsentry/sentry-javascript/pull/17619))**

  Adds a new `trace` lifecycle mode for UI profiling, allowing profiles to be captured for the duration of a trace. A `manual` mode will be added in a future release.

- **feat(nuxt): Instrument Database ([#17899](https://github.com/getsentry/sentry-javascript/pull/17899))**

  Adds instrumentation for Nuxt database operations, enabling better performance tracking of database queries.

- **feat(nuxt): Instrument server cache API ([#17886](https://github.com/getsentry/sentry-javascript/pull/17886))**

  Adds instrumentation for Nuxt's server cache API, providing visibility into cache operations.

- **feat(nuxt): Instrument storage API ([#17858](https://github.com/getsentry/sentry-javascript/pull/17858))**

  Adds instrumentation for Nuxt's storage API, enabling tracking of storage operations.

### Other Changes

- feat(browser): Add `onRequestSpanEnd` hook to browser tracing integration ([#17884](https://github.com/getsentry/sentry-javascript/pull/17884))
- feat(nextjs): Support Next.js proxy files ([#17926](https://github.com/getsentry/sentry-javascript/pull/17926))
- feat(replay): Record outcome when event buffer size exceeded ([#17946](https://github.com/getsentry/sentry-javascript/pull/17946))
- fix(cloudflare): copy execution context in durable objects and handlers ([#17786](https://github.com/getsentry/sentry-javascript/pull/17786))
- fix(core): Fix and add missing cache attributes in Vercel AI ([#17982](https://github.com/getsentry/sentry-javascript/pull/17982))
- fix(core): Improve uuid performance ([#17938](https://github.com/getsentry/sentry-javascript/pull/17938))
- fix(ember): Use updated version for `clean-css` ([#17979](https://github.com/getsentry/sentry-javascript/pull/17979))
- fix(nextjs): Don't set experimental instrumentation hook flag for next 16 ([#17978](https://github.com/getsentry/sentry-javascript/pull/17978))
- fix(nextjs): Inconsistent transaction naming for i18n routing ([#17927](https://github.com/getsentry/sentry-javascript/pull/17927))
- fix(nextjs): Update bundler detection ([#17976](https://github.com/getsentry/sentry-javascript/pull/17976))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- build: Update to typescript 5.8.0 ([#17710](https://github.com/getsentry/sentry-javascript/pull/17710))
- chore: Add external contributor to CHANGELOG.md ([#17949](https://github.com/getsentry/sentry-javascript/pull/17949))
- chore(build): Upgrade nodemon to 3.1.10 ([#17956](https://github.com/getsentry/sentry-javascript/pull/17956))
- chore(ci): Fix external contributor action when multiple contributions existed ([#17950](https://github.com/getsentry/sentry-javascript/pull/17950))
- chore(solid): Remove unnecessary import from README ([#17947](https://github.com/getsentry/sentry-javascript/pull/17947))
- test(nextjs): Fix proxy/middleware test ([#17970](https://github.com/getsentry/sentry-javascript/pull/17970))

</details>

Work in this release was contributed by @0xbad0c0d3. Thank you for your contribution!

## 10.20.0

### Important Changes

- **feat(flags): Add Growthbook integration ([#17440](https://github.com/getsentry/sentry-javascript/pull/17440))**

  Adds a new Growthbook integration for feature flag support.

- **feat(solid): Add support for TanStack Router Solid ([#17735](https://github.com/getsentry/sentry-javascript/pull/17735))**

  Adds support for TanStack Router in the Solid SDK, enabling better routing instrumentation for Solid applications.

- **feat(nextjs): Support native debugIds in turbopack ([#17853](https://github.com/getsentry/sentry-javascript/pull/17853))**

  Adds support for native Debug IDs in Turbopack, improving source map resolution and error tracking for Next.js applications using Turbopack. Native Debug ID generation will be enabled automatically for compatible versions.

### Other Changes

- feat(nextjs): Prepare for next 16 bundler default ([#17868](https://github.com/getsentry/sentry-javascript/pull/17868))
- feat(node): Capture `pino` logger name ([#17930](https://github.com/getsentry/sentry-javascript/pull/17930))
- fix(browser): Ignore React 19.2+ component render measure entries ([#17905](https://github.com/getsentry/sentry-javascript/pull/17905))
- fix(nextjs): Fix createRouteManifest with basePath ([#17838](https://github.com/getsentry/sentry-javascript/pull/17838))
- fix(react): Add `POP` guard for long-running `pageload` spans ([#17867](https://github.com/getsentry/sentry-javascript/pull/17867))
- fix(tracemetrics): Send boolean for internal replay attribute ([#17908](https://github.com/getsentry/sentry-javascript/pull/17908))
- ref(core): Add weight tracking logic to browser logs/metrics ([#17901](https://github.com/getsentry/sentry-javascript/pull/17901))

<details>
  <summary> <strong>Internal Changes</strong> </summary>
- chore(nextjs): Add Next.js 16 peer dependency ([#17925](https://github.com/getsentry/sentry-javascript/pull/17925))
- chore(ci): Update Next.js canary testing ([#17939](https://github.com/getsentry/sentry-javascript/pull/17939))
- chore: Bump size limit ([#17941](https://github.com/getsentry/sentry-javascript/pull/17941))
- test(nextjs): Add next@16 e2e test ([#17922](https://github.com/getsentry/sentry-javascript/pull/17922))
- test(nextjs): Update next 15 tests ([#17919](https://github.com/getsentry/sentry-javascript/pull/17919))
- chore: Add external contributor to CHANGELOG.md ([#17915](https://github.com/getsentry/sentry-javascript/pull/17915))
- chore: Add external contributor to CHANGELOG.md ([#17928](https://github.com/getsentry/sentry-javascript/pull/17928))
- chore: Add external contributor to CHANGELOG.md ([#17940](https://github.com/getsentry/sentry-javascript/pull/17940))
</details>

Work in this release was contributed by @seoyeon9888, @madhuchavva and @thedanchez. Thank you for your contributions!

## 10.19.0

- feat(tracemetrics): Add trace metrics behind an experiments flag ([#17883](https://github.com/getsentry/sentry-javascript/pull/17883))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- chore: add info latest release for the cursor release command ([#17876](https://github.com/getsentry/sentry-javascript/pull/17876))

</details>

## 10.18.0

### Important Changes

- **feat(node): `pino` integration ([#17584](https://github.com/getsentry/sentry-javascript/pull/17584))**

  This release adds a new `pino` integration for Node.js, enabling Sentry to capture logs from the Pino logging library.

- **feat: Remove @sentry/pino-transport package ([#17851](https://github.com/getsentry/sentry-javascript/pull/17851))**

  The `@sentry/pino-transport` package has been removed. Please use the new `pino` integration in `@sentry/node` instead.

- **feat(node-core): Extend onnhandledrejection with ignore errors option ([#17736](https://github.com/getsentry/sentry-javascript/pull/17736))**

  Added support for selectively suppressing specific errors with configurable logging control in onnhandledrejection integration.

### Other Changes

- feat(core): Rename vercelai.schema to gen_ai.request.schema ([#17850](https://github.com/getsentry/sentry-javascript/pull/17850))
- feat(core): Support stream responses and tool calls for Google GenAI ([#17664](https://github.com/getsentry/sentry-javascript/pull/17664))
- feat(nextjs): Attach headers using client hook ([#17831](https://github.com/getsentry/sentry-javascript/pull/17831))
- fix(core): Keep all property values in baggage header ([#17847](https://github.com/getsentry/sentry-javascript/pull/17847))
- fix(nestjs): Add support for Symbol as event name ([#17785](https://github.com/getsentry/sentry-javascript/pull/17785))
- fix(nuxt): include `sentry.client.config.ts` in nuxt app types ([#17830](https://github.com/getsentry/sentry-javascript/pull/17830))
- fix(react-router): Fix type for `OriginalHandleRequest` with middleware ([#17870](https://github.com/getsentry/sentry-javascript/pull/17870))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- chore: Add external contributor to CHANGELOG.md ([#17866](https://github.com/getsentry/sentry-javascript/pull/17866))
- chore(deps): Bump @sentry/cli from 2.53.0 to 2.56.0 ([#17819](https://github.com/getsentry/sentry-javascript/pull/17819))
- chore(deps): Bump axios in browser integration tests ([#17839](https://github.com/getsentry/sentry-javascript/pull/17839))
- chore(deps): Bump nestjs in integration tests ([#17840](https://github.com/getsentry/sentry-javascript/pull/17840))

</details>

Work in this release was contributed by @stefanvanderwolf. Thank you for your contribution!

## 10.17.0

### Important Changes

- **feat(nuxt): Implement server middleware instrumentation ([#17796](https://github.com/getsentry/sentry-javascript/pull/17796))**

  This release introduces instrumentation for Nuxt middleware, ensuring that all middleware handlers are automatically wrapped with tracing and error reporting functionality.

- **fix(aws-serverless): Take `http_proxy` into account when choosing
  `useLayerExtension` default ([#17817](https://github.com/getsentry/sentry-javascript/pull/17817))**

  The default setting for `useLayerExtension` now considers the `http_proxy` environment variable.
  When `http_proxy` is set, `useLayerExtension` will be off by default.
  If you use a `http_proxy` but would still like to make use of the Sentry Lambda extension, exempt `localhost` in a `no_proxy` environment variable.

### Other Changes

- feat(node): Split up http integration into composable parts ([#17524](https://github.com/getsentry/sentry-javascript/pull/17524))
- fix(core): Remove check and always respect ai.telemetry.functionId for Vercel AI gen spans ([#17811](https://github.com/getsentry/sentry-javascript/pull/17811))
- doc(core): Fix outdated JSDoc in `beforeSendSpan` ([#17815](https://github.com/getsentry/sentry-javascript/pull/17815))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- ci: Do not run dependabot on e2e test applications ([#17813](https://github.com/getsentry/sentry-javascript/pull/17813))
- docs: Reword changelog for google gen ai integration ([#17805](https://github.com/getsentry/sentry-javascript/pull/17805))

</details>

## 10.16.0

- feat(logs): Add internal `replay_is_buffering` flag ([#17752](https://github.com/getsentry/sentry-javascript/pull/17752))
- feat(react-router): Update loadContext type to be compatible with middleware ([#17758](https://github.com/getsentry/sentry-javascript/pull/17758))
- feat(replay/logs): Only attach sampled replay Ids to logs ([#17750](https://github.com/getsentry/sentry-javascript/pull/17750))
- fix(browser): Use current start timestamp for CLS span when CLS is 0 ([#17800](https://github.com/getsentry/sentry-javascript/pull/17800))
- fix(core): Prevent `instrumentAnthropicAiClient` breaking MessageStream api ([#17754](https://github.com/getsentry/sentry-javascript/pull/17754))
- fix(nextjs): Don't use chalk in turbopack config file ([#17806](https://github.com/getsentry/sentry-javascript/pull/17806))
- fix(react): Do not send additional navigation span on pageload ([#17799](https://github.com/getsentry/sentry-javascript/pull/17799))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- build(aws): Ensure AWS build cache does not keep old files ([#17776](https://github.com/getsentry/sentry-javascript/pull/17776))
- chore: Add `publish_release` command ([#17797](https://github.com/getsentry/sentry-javascript/pull/17797))
- ref(aws-serverless): Add resolution for `import-in-the-middle` when building the Lambda layer ([#17780](https://github.com/getsentry/sentry-javascript/pull/17780))
- ref(aws-serverless): Improve README with better examples ([#17787](https://github.com/getsentry/sentry-javascript/pull/17787))
- ref(core): Improve promise buffer ([#17788](https://github.com/getsentry/sentry-javascript/pull/17788))
- Revert "test(e2e): Pin `import-in-the-middle@1.14.2` due to `@vercel/nft` incompatibility ([#17777](https://github.com/getsentry/sentry-javascript/pull/17777))" (#17784)
- test(e2e): Pin `import-in-the-middle@1.14.2` due to `@vercel/nft` incompatibility ([#17777](https://github.com/getsentry/sentry-javascript/pull/17777))
- test(nextjs): Add route handler tests for turbopack ([#17515](https://github.com/getsentry/sentry-javascript/pull/17515))
- test(react-router): Test v8 middleware ([#17783](https://github.com/getsentry/sentry-javascript/pull/17783))

</details>

## 10.15.0

### Important Changes

- **feat(cloudflare): Add honoIntegration with error-filtering function ([#17743](https://github.com/getsentry/sentry-javascript/pull/17743))**

  This release adds a `honoIntegration` to `@sentry/cloudflare`, which exposes a `shouldHandleError` function that lets you define which errors in `onError` should be captured.
  By default, Sentry captures exceptions with `error.status >= 500 || error.status <= 299`.

  The integration is added by default, and it's possible to modify this behavior like this:

  ```js
   integrations: [
     honoIntegration({
      shouldHandleError: (err) => true; // always capture exceptions in onError
     })
   ]
  ```

- **feat(node): Add instrumentation for hono handler ([#17428](https://github.com/getsentry/sentry-javascript/pull/17428))**

This PR enhances the Hono integration by adding comprehensive handler instrumentation, error handling capabilities.

- **feat(aws): Enable Lambda extension by default when using the Lamba layer ([#17684](https://github.com/getsentry/sentry-javascript/pull/17684))**

- **feat(browser): Add `setActiveSpanInBrowser` to set an active span in the browser ([#17714](https://github.com/getsentry/sentry-javascript/pull/17714))**

This PR adds a feature to the browser SDKs only: Making an inactive span active. We do this to enable use cases where having a span only being active in the callback is not practical.

### Other Changes

- fix(browser): Improve handling of `0` and `undefined` resource timing values ([#17751](https://github.com/getsentry/sentry-javascript/pull/17751))
- ref(nextjs): Display build compatibility warning for webpack ([#17746](https://github.com/getsentry/sentry-javascript/pull/17746))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- docs: Reword changelog for google gen ai instrumentation ([#17753](https://github.com/getsentry/sentry-javascript/pull/17753))
- build: Add `@typescript-eslint/no-unnecessary-type-assertion` rule ([#17728](https://github.com/getsentry/sentry-javascript/pull/17728))
- build: Update TS target to `es2020` everywhere ([#17709](https://github.com/getsentry/sentry-javascript/pull/17709))
- chore: Add external contributor to CHANGELOG.md ([#17745](https://github.com/getsentry/sentry-javascript/pull/17745))

</details>

Work in this release was contributed by @Karibash. Thank you for your contribution!

## 10.14.0

### Important Changes

- **feat(cloudflare,vercel-edge): Add support for Google Gen AI instrumentation ([#17723](https://github.com/getsentry/sentry-javascript/pull/17723))**

  The SDK now supports manually instrumenting Google's Gen AI operations in Cloudflare Workers and Vercel Edge Runtime environments, providing insights into your AI operations. You can use `const wrappedClient = Sentry.instrumentGoogleGenAIClient(genAiClient)` to get an instrumented client.

### Other Changes

- fix(nextjs): Display updated turbopack warnings ([#17737](https://github.com/getsentry/sentry-javascript/pull/17737))
- ref(core): Wrap isolationscope in `WeakRef` when storing it on spans ([#17712](https://github.com/getsentry/sentry-javascript/pull/17712))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- test(node): Avoid using specific port for node-integration-tests ([#17729](https://github.com/getsentry/sentry-javascript/pull/17729))
- test(nuxt): Update Nuxt version and add Nitro $fetch test ([#17713](https://github.com/getsentry/sentry-javascript/pull/17713))

</details>

## 10.13.0

### Important Changes

- **feat(browser): Add option to explicitly end pageload span via `reportPageLoaded()` ([#17697](https://github.com/getsentry/sentry-javascript/pull/17697))**

  With this release you can take manual control of ending the pageload span. Usually this span is ended automatically by the SDK, based on a period of inactivity after the initial page was loaded in the browser. If you want full control over the pageload duration, you can tell Sentry, when your page was fully loaded:

  ```js
  Sentry.init({
    //...
    integrations: [
      // 1. Enable manual pageload reporting
      Sentry.browserTracingIntegration({ enableReportPageLoaded: true }),
    ],
  });

  // 2. Whenever you decide the page is loaded, call:
  Sentry.reportPageLoaded();
  ```

  Note that if `Sentry.reportPageLoaded()` is not called within 30 seconds of the initial pageload (or whatever value the `finalTimeout` option is set to), the pageload span will be ended automatically.

- **feat(core,node): Add instrumentation for `GoogleGenAI` ([#17625](https://github.com/getsentry/sentry-javascript/pull/17625))**

  The SDK now automatically instruments the `@google/genai` package to provide insights into your AI operations.

- **feat(nextjs): Promote `useRunAfterProductionCompileHook` to non-experimental build option ([#17721](https://github.com/getsentry/sentry-javascript/pull/17721))**

  The `useRunAfterProductionCompileHook` option is no longer experimental and is now a stable build option for Next.js projects.

- **feat(nextjs): Use `afterProductionCompile` hook for webpack builds ([#17655](https://github.com/getsentry/sentry-javascript/pull/17655))**

  Next.js projects using webpack can opt-in to use the `useRunAfterProductionCompileHook` hook for source map uploads.

- **feat(nextjs): Flip default value for `useRunAfterProductionCompileHook` for Turbopack builds ([#17722](https://github.com/getsentry/sentry-javascript/pull/17722))**

  The `useRunAfterProductionCompileHook` option is now enabled by default for Turbopack builds, enabling automated source map uploads.

- **feat(node): Do not drop 300 and 304 status codes by default ([#17686](https://github.com/getsentry/sentry-javascript/pull/17686))**

  HTTP transactions with 300 and 304 status codes are now captured by default, providing better visibility into redirect and caching behavior.

### Other Changes

- feat(core): Add logger to core and allow scope to be passed log methods ([#17698](https://github.com/getsentry/sentry-javascript/pull/17698))
- feat(core): Allow to pass `onSuccess` to `handleCallbackErrors` ([#17679](https://github.com/getsentry/sentry-javascript/pull/17679))
- feat(core): Create template attributes in `consoleLoggingIntegration` ([#17703](https://github.com/getsentry/sentry-javascript/pull/17703))
- feat(deps): bump @sentry/cli from 2.52.0 to 2.53.0 ([#17652](https://github.com/getsentry/sentry-javascript/pull/17652))
- feat(node): Add extra platforms to `os` context ([#17720](https://github.com/getsentry/sentry-javascript/pull/17720))
- fix(browser): Ensure idle span duration is adjusted when child spans are ignored ([#17700](https://github.com/getsentry/sentry-javascript/pull/17700))
- fix(core): Ensure builtin stack frames don't affect `thirdPartyErrorFilterIntegration` ([#17693](https://github.com/getsentry/sentry-javascript/pull/17693))
- fix(core): Fix client hook edge cases around multiple callbacks ([#17706](https://github.com/getsentry/sentry-javascript/pull/17706))
- fix(nextjs): Enable fetch span when OTel setup is skipped ([#17699](https://github.com/getsentry/sentry-javascript/pull/17699))
- fix(node): Fix `this` context for vercel AI instrumentation ([#17681](https://github.com/getsentry/sentry-javascript/pull/17681))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- chore: Add external contributor to CHANGELOG.md ([#17725](https://github.com/getsentry/sentry-javascript/pull/17725))
- chore: Add link to build and test icon in readme ([#17719](https://github.com/getsentry/sentry-javascript/pull/17719))
- chore(nuxt): Bump Vite and Rollup plugins ([#17671](https://github.com/getsentry/sentry-javascript/pull/17671))
- chore(repo): Add changelog entry for `reportPageLoaded` ([#17724](https://github.com/getsentry/sentry-javascript/pull/17724))
- ci: Fix lookup of changed E2E test apps ([#17707](https://github.com/getsentry/sentry-javascript/pull/17707))
- ci(test-matrix): Add logs for `getTestMatrix` ([#17673](https://github.com/getsentry/sentry-javascript/pull/17673))
- ref: Avoid some usage of `SyncPromise` where not needed ([#17641](https://github.com/getsentry/sentry-javascript/pull/17641))
- ref(core): Add debug log when dropping a span via `ignoreSpans` ([#17692](https://github.com/getsentry/sentry-javascript/pull/17692))
- ref(core): Avoid looking up anthropic-ai integration options ([#17694](https://github.com/getsentry/sentry-javascript/pull/17694))
- ref(core): Streamline `module_metadata` assignment and cleanup functions ([#17696](https://github.com/getsentry/sentry-javascript/pull/17696))
- ref(remix): Avoid unnecessary error wrapping `HandleDocumentRequestFunction` ([#17680](https://github.com/getsentry/sentry-javascript/pull/17680))
- Revert "[Gitflow] Merge master into develop"

</details>

Work in this release was contributed by @Olexandr88. Thank you for your contribution!

## 10.12.0

### Important Changes

- **ref: Add and Adjust error event `mechanism` values**

  This release includes a variety of changes aimed at setting the `mechanism` field on errors captured automatically by the Sentry SDKs. [The intention](https://github.com/getsentry/sentry-javascript/issues/17212) is to clearly mark which instrumentation captured an error. In addition, some instrumentations previously did not yet annotate the error as handled or unhandled which this series of PRs corrects as well.

  <details>
  <summary> Relevant PRs </summary>

  <br/>

  Released in `10.12.0`:
  - ref(angular): Adjust ErrorHandler event mechanism ([#17608](https://github.com/getsentry/sentry-javascript/pull/17608))
  - ref(astro): Adjust `mechanism` on error events captured by astro middleware ([#17613](https://github.com/getsentry/sentry-javascript/pull/17613))
  - ref(aws-severless): Slightly adjust aws-serverless mechanism type ([#17614](https://github.com/getsentry/sentry-javascript/pull/17614))
  - ref(bun): Adjust `mechanism` of errors captured in Bun.serve ([#17616](https://github.com/getsentry/sentry-javascript/pull/17616))
  - ref(cloudflare): Adjust event `mechanisms` and durable object origin ([#17618](https://github.com/getsentry/sentry-javascript/pull/17618))
  - ref(core): Adjust `mechanism` in `captureConsoleIntegration` ([#17633](https://github.com/getsentry/sentry-javascript/pull/17633))
  - ref(core): Adjust MCP server error event `mechanism` ([#17622](https://github.com/getsentry/sentry-javascript/pull/17622))
  - ref(core): Simplify `linkedErrors` mechanism logic ([#17600](https://github.com/getsentry/sentry-javascript/pull/17600))
  - ref(deno): Adjust `mechanism` of errors caught by `globalHandlersIntegration` ([#17635](https://github.com/getsentry/sentry-javascript/pull/17635))
  - ref(nextjs): Set more specific event `mechanism`s ([#17543](https://github.com/getsentry/sentry-javascript/pull/17543))
  - ref(node): Adjust mechanism of express, hapi and fastify error handlers ([#17623](https://github.com/getsentry/sentry-javascript/pull/17623))
  - ref(node-core): Add `mechanism` to cron instrumentations ([#17544](https://github.com/getsentry/sentry-javascript/pull/17544))
  - ref(node-core): Add more specific `mechanism.type` to worker thread errors from `childProcessIntegration` ([#17578](https://github.com/getsentry/sentry-javascript/pull/17578))
  - ref(node-core): Adjust `mechanism` of `onUnhandledRejection` and `onUnhandledException` integrations ([#17636](https://github.com/getsentry/sentry-javascript/pull/17636))
  - ref(node): Add mechanism to errors captured via connect and koa integrations ([#17579](https://github.com/getsentry/sentry-javascript/pull/17579))
  - ref(nuxt): Add and adjust `mechanism.type` in error events ([#17599](https://github.com/getsentry/sentry-javascript/pull/17599))
  - ref(react): Add mechanism to `reactErrorHandler` and adjust mechanism in `ErrorBoundary` ([#17602](https://github.com/getsentry/sentry-javascript/pull/17602))
  - ref(remix): Adjust event mechanism of `captureRemixServerException` ([#17629](https://github.com/getsentry/sentry-javascript/pull/17629))
  - ref(replay-internal): Add mechanism to error caught by `replayIntegration` in debug mode ([#17606](https://github.com/getsentry/sentry-javascript/pull/17606))
  - ref(solid): Add `mechanism` to error captured by `withSentryErrorBoundary` ([#17607](https://github.com/getsentry/sentry-javascript/pull/17607))
  - ref(solidstart): Adjust event mechanism in withServerActionInstrumentation ([#17637](https://github.com/getsentry/sentry-javascript/pull/17637))
  - ref(sveltekit): Adjust `mechanism` of error events ([#17646](https://github.com/getsentry/sentry-javascript/pull/17646))
  - ref(vue): Adjust mechanism in Vue error handler ([#17647](https://github.com/getsentry/sentry-javascript/pull/17647))

  <br/>

  Released in `10.11.0`:
  - ref(browser): Add more specific `mechanism.type` to errors captured by `httpClientIntegration` ([#17254](https://github.com/getsentry/sentry-javascript/pull/17254))
  - ref(browser): Set more descriptive `mechanism.type` in `browserApiErrorsIntergation` ([#17251](https://github.com/getsentry/sentry-javascript/pull/17251))
  - ref(core): Add `mechanism.type` to `trpcMiddleware` errors ([#17287](https://github.com/getsentry/sentry-javascript/pull/17287))
  - ref(core): Add more specific event `mechanism`s and span origins to `openAiIntegration` ([#17288](https://github.com/getsentry/sentry-javascript/pull/17288))
  - ref(nestjs): Add `mechanism` to captured errors ([#17312](https://github.com/getsentry/sentry-javascript/pull/17312))

</details>

- **feat(node) Ensure `prismaIntegration` works with Prisma 5 ([#17595](https://github.com/getsentry/sentry-javascript/pull/17595))**

We used to require to pass in the v5 version of `@prisma/instrumentation` into `prismaIntegration({ prismaInstrumentation: new PrismaInstrumentation() })`, if you wanted to get full instrumentation for Prisma v5. However, it turns out this does not work on v10 of the SDK anymore, because `@prisma/instrumentation@5` requires OTEL v1.

With this release, we dropped the requirement to configure anything to get v5 support of Prisma. You do not need to configure anything in the integration anymore, and can remove the dependency on `@prisma/instrumentation@5` if you had it in your application. You only need to configure the `tracing` preview feature [according to our docs](https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/prisma/).

- **feat(deps): Update OpenTelemetry dependencies ([#17558](https://github.com/getsentry/sentry-javascript/pull/17558))**
  - @opentelemetry/core bumped to ^2.1.0
  - @opentelemetry/context-async-hooks bumped to ^2.1.0
  - @opentelemetry/resources bumped to ^2.1.0
  - @opentelemetry/sdk-trace-base bumped to ^2.1.0
  - @opentelemetry/semantic-conventions bumped to ^1.37.0
  - @opentelemetry/instrumentation bumped to ^0.204.0
  - @opentelemetry/instrumentation-http bumped to ^0.204.0
  - @opentelemetry/instrumentation-amqplib bumped to ^0.51.0
  - @opentelemetry/instrumentation-aws-sdk bumped to ^0.59.0
  - @opentelemetry/instrumentation-connect bumped to ^0.48.0
  - @opentelemetry/instrumentation-dataloader bumped to ^0.22.0
  - @opentelemetry/instrumentation-express bumped to ^0.53.0
  - @opentelemetry/instrumentation-fs bumped from to ^0.24.0
  - @opentelemetry/instrumentation-generic-pool bumped to ^0.48.0
  - @opentelemetry/instrumentation-graphql bumped to ^0.52.0
  - @opentelemetry/instrumentation-hapi bumped to ^0.51.0
  - @opentelemetry/instrumentation-ioredis bumped to ^0.52.0
  - @opentelemetry/instrumentation-kafkajs bumped to ^0.14.0
  - @opentelemetry/instrumentation-knex bumped to ^0.49.0
  - @opentelemetry/instrumentation-koa bumped to ^0.52.0
  - @opentelemetry/instrumentation-lru-memoizer bumped to ^0.49.0
  - @opentelemetry/instrumentation-mongodb bumped from to ^0.57.0
  - @opentelemetry/instrumentation-mongoose bumped from to ^0.51.0
  - @opentelemetry/instrumentation-mysql bumped to ^0.50.0
  - @opentelemetry/instrumentation-mysql2 bumped to ^0.51.0
  - @opentelemetry/instrumentation-nestjs-core bumped to ^0.50.0
  - @opentelemetry/instrumentation-pg bumped to ^0.57.0
  - @opentelemetry/instrumentation-redis bumped to ^0.53.0
  - @opentelemetry/instrumentation-undici bumped to ^0.15.0
  - @prisma/instrumentation bumped to 6.15.0

### Other Changes

- feat(browser): Add timing and status atttributes to resource spans ([#17562](https://github.com/getsentry/sentry-javascript/pull/17562))
- feat(cloudflare,vercel-edge): Add support for Anthropic AI instrumentation ([#17571](https://github.com/getsentry/sentry-javascript/pull/17571))
- feat(core): Add Consola integration ([#17435](https://github.com/getsentry/sentry-javascript/pull/17435))
- feat(deps): Update OpenTelemetry dependencies ([#17569](https://github.com/getsentry/sentry-javascript/pull/17569))
- feat(core): Export `TracesSamplerSamplingContext` type ([#17523](https://github.com/getsentry/sentry-javascript/pull/17523))
- feat(deno): Add OpenTelemetry support and vercelAI integration ([#17445](https://github.com/getsentry/sentry-javascript/pull/17445))
- feat(node-core): Remove experimental note from winston api ([#17626](https://github.com/getsentry/sentry-javascript/pull/17626))
- feat(node): Ensure `prismaIntegration` works with Prisma v5 ([#17595](https://github.com/getsentry/sentry-javascript/pull/17595))
- feat(node): Tidy existing ESM loader hook ([#17566](https://github.com/getsentry/sentry-javascript/pull/17566))
- feat(sveltekit): Align build time options with shared type ([#17413](https://github.com/getsentry/sentry-javascript/pull/17413))
- fix(core): Fix error handling when sending envelopes ([#17662](https://github.com/getsentry/sentry-javascript/pull/17662))
- fix(browser): Always start navigation as root span ([#17648](https://github.com/getsentry/sentry-javascript/pull/17648))
- fix(browser): Ensure propagated `parentSpanId` stays consistent during trace in TwP mode ([#17526](https://github.com/getsentry/sentry-javascript/pull/17526))
- fix(cloudflare): Initialize once per workflow run and preserve scope for `step.do` ([#17582](https://github.com/getsentry/sentry-javascript/pull/17582))
- fix(nextjs): Add edge polyfills for nextjs-13 in dev mode ([#17488](https://github.com/getsentry/sentry-javascript/pull/17488))
- fix(nitro): Support nested `_platform` properties in Nitro 2.11.7+ ([#17596](https://github.com/getsentry/sentry-javascript/pull/17596))
- fix(node): Preserve synchronous return behavior for streamText and other methods for AI ([#17580](https://github.com/getsentry/sentry-javascript/pull/17580))
- ref(node): Inline types imported from `shimmer` ([#17597](https://github.com/getsentry/sentry-javascript/pull/17597)) - ref(nuxt): Add and adjust `mechanism.type` in error events ([#17599](https://github.com/getsentry/sentry-javascript/pull/17599))
- ref(browser): Improve `fetchTransport` error handling ([#17661](https://github.com/getsentry/sentry-javascript/pull/17661))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- chore: Add changelog note about mechanism changes ([#17632](https://github.com/getsentry/sentry-javascript/pull/17632))
- chore(aws): Update README.md ([#17601](https://github.com/getsentry/sentry-javascript/pull/17601))
- chore(deps): bump hono from 4.7.10 to 4.9.7 in /dev-packages/e2e-tests/test-applications/cloudflare-hono ([#17630](https://github.com/getsentry/sentry-javascript/pull/17630))
- chore(deps): bump next from 14.2.25 to 14.2.32 in /dev-packages/e2e-tests/test-applications/nextjs-app-dir ([#17627](https://github.com/getsentry/sentry-javascript/pull/17627))
- chore(deps): bump next from 14.2.25 to 14.2.32 in /dev-packages/e2e-tests/test-applications/nextjs-pages-dir ([#17620](https://github.com/getsentry/sentry-javascript/pull/17620))
- chore(deps): bump next from 14.2.29 to 14.2.32 in /dev-packages/e2e-tests/test-applications/nextjs-orpc ([#17494](https://github.com/getsentry/sentry-javascript/pull/17494))
- chore(deps): bump next from 14.2.30 to 14.2.32 in /dev-packages/e2e-tests/test-applications/nextjs-14 ([#17628](https://github.com/getsentry/sentry-javascript/pull/17628))
- chore(repo): Rename `.claude/settings.local.json` to `.claude/settings.json` ([#17591](https://github.com/getsentry/sentry-javascript/pull/17591))
- docs(issue-template): Add note about prioritization ([#17590](https://github.com/getsentry/sentry-javascript/pull/17590))
- ref(core): Streamline event processor handling ([#17634](https://github.com/getsentry/sentry-javascript/pull/17634))
- test(angular): Bump TS version to 5.9.0 in Angular 20 e2e test ([#17605](https://github.com/getsentry/sentry-javascript/pull/17605))
- test(nextjs): Remove Next 13 and pin Next 14 canary and latest tests ([#17577](https://github.com/getsentry/sentry-javascript/pull/17577))
- test(react-router): Unflake `flushIfServerless` test ([#17610](https://github.com/getsentry/sentry-javascript/pull/17610))

</details>

## 10.11.0

### Important Changes

- **feat(aws): Add experimental AWS Lambda extension for tunnelling events ([#17525](https://github.com/getsentry/sentry-javascript/pull/17525))**

  This release adds an experimental Sentry Lambda extension to the existing Sentry Lambda layer. Sentry events are now tunneled through the extension and then forwarded to Sentry. This has the benefit of reducing the request processing time.

  To enable it, set `_experiments.enableLambdaExtension` in your Sentry config like this:

  ```javascript
  Sentry.init({
    dsn: '<YOUR_DSN>',
    _experiments: {
      enableLambdaExtension: true,
    },
  });
  ```

### Other Changes

- feat(core): Add replay id to logs ([#17563](https://github.com/getsentry/sentry-javascript/pull/17563))
- feat(core): Improve error handling for Anthropic AI instrumentation ([#17535](https://github.com/getsentry/sentry-javascript/pull/17535))
- feat(deps): bump @opentelemetry/instrumentation-ioredis from 0.51.0 to 0.52.0 ([#17557](https://github.com/getsentry/sentry-javascript/pull/17557))
- feat(node): Add incoming request headers as OTel span attributes ([#17475](https://github.com/getsentry/sentry-javascript/pull/17475))
- fix(astro): Ensure traces are correctly propagated for static routes ([#17536](https://github.com/getsentry/sentry-javascript/pull/17536))
- fix(react): Remove `handleExistingNavigation` ([#17534](https://github.com/getsentry/sentry-javascript/pull/17534))
- ref(browser): Add more specific `mechanism.type` to errors captured by `httpClientIntegration` ([#17254](https://github.com/getsentry/sentry-javascript/pull/17254))
- ref(browser): Set more descriptive `mechanism.type` in `browserApiErrorsIntergation` ([#17251](https://github.com/getsentry/sentry-javascript/pull/17251))
- ref(core): Add `mechanism.type` to `trpcMiddleware` errors ([#17287](https://github.com/getsentry/sentry-javascript/pull/17287))
- ref(core): Add more specific event `mechanism`s and span origins to `openAiIntegration` ([#17288](https://github.com/getsentry/sentry-javascript/pull/17288))
- ref(nestjs): Add `mechanism` to captured errors ([#17312](https://github.com/getsentry/sentry-javascript/pull/17312))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- chore: Use proper `test-utils` dependency in workspace ([#17538](https://github.com/getsentry/sentry-javascript/pull/17538))
- chore(test): Remove `geist` font ([#17541](https://github.com/getsentry/sentry-javascript/pull/17541))
- ci: Check for stable lockfile ([#17552](https://github.com/getsentry/sentry-javascript/pull/17552))
- ci: Fix running of only changed E2E tests ([#17551](https://github.com/getsentry/sentry-javascript/pull/17551))
- ci: Remove project automation workflow ([#17508](https://github.com/getsentry/sentry-javascript/pull/17508))
- test(node-integration-tests): pin ai@5.0.30 to fix test fails ([#17542](https://github.com/getsentry/sentry-javascript/pull/17542))

</details>

## 10.10.0

### Important Changes

- **feat(browser): Add support for `propagateTraceparent` SDK option ([#17509](https://github.com/getsentry/sentry-javascript/pull/17509))**

Adds support for a new browser SDK init option, `propagateTraceparent` for attaching a W3C compliant traceparent header to outgoing fetch and XHR requests, in addition to sentry-trace and baggage headers. More details can be found [here](https://develop.sentry.dev/sdk/telemetry/traces/#propagatetraceparent).

- **feat(core): Add tool calls attributes for Anthropic AI ([#17478](https://github.com/getsentry/sentry-javascript/pull/17478))**

Adds missing tool call attributes, we add gen_ai.response.tool_calls attribute for Anthropic AI, supporting both streaming and non-streaming requests.

- **feat(nextjs): Use compiler hook for uploading turbopack sourcemaps ([#17352](https://github.com/getsentry/sentry-javascript/pull/17352))**

Adds a new _experimental_ flag `_experimental.useRunAfterProductionCompileHook` to `withSentryConfig` for automatic source maps uploads when building a Next.js app with `next build --turbopack`.
When set we:

- Automatically enable source map generation for turbopack client files (if not explicitly disabled)
- Upload generated source maps to Sentry at the end of the build by leveraging [a Next.js compiler hook](https://nextjs.org/docs/architecture/nextjs-compiler#runafterproductioncompile).

### Other Changes

- feat(feedback): Add more labels so people can configure Highlight and Hide labels ([#17513](https://github.com/getsentry/sentry-javascript/pull/17513))
- fix(node): Add `origin` for OpenAI spans & test auto instrumentation ([#17519](https://github.com/getsentry/sentry-javascript/pull/17519))

## 10.9.0

### Important Changes

- **feat(node): Update `httpIntegration` handling of incoming requests ([#17371](https://github.com/getsentry/sentry-javascript/pull/17371))**

This version updates the handling of the Node SDK of incoming requests. Instead of relying on @opentelemetry/instrumentation-http, we now handle incoming request instrumentation internally, ensuring that we can optimize performance as much as possible and avoid interop problems.

This change should not affect you, unless you're relying on very in-depth implementation details. Importantly, this also drops the `_experimentalConfig` option of the integration - this will no longer do anything.
Finally, you can still pass `instrumentation.{requestHook,responseHook,applyCustomAttributesOnSpan}` options, but they are deprecated and will be removed in v11. Instead, you can use the new `incomingRequestSpanHook` configuration option if you want to adjust the incoming request span.

### Other Changes

- feat(browser): Add replay.feedback CDN bundle ([#17496](https://github.com/getsentry/sentry-javascript/pull/17496))
- feat(browser): Export `sendFeedback` from CDN bundles ([#17495](https://github.com/getsentry/sentry-javascript/pull/17495))
- fix(astro): Ensure span name from `beforeStartSpan` isn't overwritten ([#17500](https://github.com/getsentry/sentry-javascript/pull/17500))
- fix(browser): Ensure source is set correctly when updating span name in-place in `beforeStartSpan` ([#17501](https://github.com/getsentry/sentry-javascript/pull/17501))
- fix(core): Only set template attributes on logs if parameters exist ([#17480](https://github.com/getsentry/sentry-javascript/pull/17480))
- fix(nextjs): Fix parameterization for root catchall routes ([#17489](https://github.com/getsentry/sentry-javascript/pull/17489))
- fix(node-core): Shut down OTel TraceProvider when calling `Sentry.close()` ([#17499](https://github.com/getsentry/sentry-javascript/pull/17499))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- chore: Add `changelog` script back to package.json ([#17517](https://github.com/getsentry/sentry-javascript/pull/17517))
- chore: Ensure prettier is run on all files ([#17497](https://github.com/getsentry/sentry-javascript/pull/17497))
- chore: Ignore prettier commit for git blame ([#17498](https://github.com/getsentry/sentry-javascript/pull/17498))
- chore: Remove experimental from Nuxt SDK package description ([#17483](https://github.com/getsentry/sentry-javascript/pull/17483))
- ci: Capture overhead in node app ([#17420](https://github.com/getsentry/sentry-javascript/pull/17420))
- ci: Ensure we fail on cancelled jobs ([#17506](https://github.com/getsentry/sentry-javascript/pull/17506))
- ci(deps): bump actions/checkout from 4 to 5 ([#17505](https://github.com/getsentry/sentry-javascript/pull/17505))
- ci(deps): bump actions/create-github-app-token from 2.0.6 to 2.1.1 ([#17504](https://github.com/getsentry/sentry-javascript/pull/17504))
- test(aws): Improve reliability on CI ([#17502](https://github.com/getsentry/sentry-javascript/pull/17502))

</details>

## 10.8.0

### Important Changes

- **feat(sveltekit): Add Compatibility for builtin SvelteKit Tracing ([#17423](https://github.com/getsentry/sentry-javascript/pull/17423))**

  This release makes the `@sentry/sveltekit` SDK compatible with SvelteKit's native [observability support](https://svelte.dev/docs/kit/observability) introduced in SvelteKit version `2.31.0`.
  If you enable both, instrumentation and tracing, the SDK will now initialize early enough to set up additional instrumentation like database queries and it will pick up spans emitted from SvelteKit.

  We will follow up with docs how to set up the SDK soon.
  For now, If you're on SvelteKit version `2.31.0` or newer, you can easily opt into the new feature:
  1. Enable [experimental tracing and instrumentation support](https://svelte.dev/docs/kit/observability) in `svelte.config.js`:
  2. Move your `Sentry.init()` call from `src/hooks.server.(js|ts)` to the new `instrumentation.server.(js|ts)` file:

     ```ts
     // instrumentation.server.ts
     import * as Sentry from '@sentry/sveltekit';

     Sentry.init({
       dsn: '...',
       // rest of your config
     });
     ```

     The rest of your Sentry config in `hooks.server.ts` (`sentryHandle` and `handleErrorWithSentry`) should stay the same.

  If you prefer to stay on the hooks-file based config for now, the SDK will continue to work as previously.

  Thanks to the Svelte team and @elliott-with-the-longest-name-on-github for implementing observability support and for reviewing our PR!

### Other Changes

- fix(react): Avoid multiple name updates on navigation spans ([#17438](https://github.com/getsentry/sentry-javascript/pull/17438))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- test(profiling): Add tests for current state of profiling ([#17470](https://github.com/getsentry/sentry-javascript/pull/17470))

</details>

## 10.7.0

### Important Changes

- **feat(cloudflare): Add `instrumentPrototypeMethods` option to instrument RPC methods for DurableObjects ([#17424](https://github.com/getsentry/sentry-javascript/pull/17424))**

By default, `Sentry.instrumentDurableObjectWithSentry` will not wrap any RPC methods on the prototype. To enable wrapping for RPC methods, set `instrumentPrototypeMethods` to `true` or, if performance is a concern, a list of only the methods you want to instrument:

```js
class MyDurableObjectBase extends DurableObject<Env> {
  method1() {
    // ...
  }

  method2() {
    // ...
  }

  method3() {
    // ...
  }
}
// Export your named class as defined in your wrangler config
export const MyDurableObject = Sentry.instrumentDurableObjectWithSentry(
  (env: Env) => ({
    dsn: "https://ac49b7af3017c458bd12dab9b3328bfc@o4508482761982032.ingest.de.sentry.io/4508482780987481",
    tracesSampleRate: 1.0,
    instrumentPrototypeMethods: ['method1', 'method3'],
  }),
  MyDurableObjectBase,
);
```

## Other Changes

- feat(aws): Add support for streaming handlers ([#17463](https://github.com/getsentry/sentry-javascript/pull/17463))
- feat(core): Stream responses Anthropic AI ([#17460](https://github.com/getsentry/sentry-javascript/pull/17460))
- feat(deps): bump @opentelemetry/instrumentation-aws-sdk from 0.56.0 to 0.57.0 ([#17455](https://github.com/getsentry/sentry-javascript/pull/17455))
- feat(deps): bump @opentelemetry/instrumentation-dataloader from 0.21.0 to 0.21.1 ([#17457](https://github.com/getsentry/sentry-javascript/pull/17457))
- feat(deps): bump @opentelemetry/instrumentation-kafkajs from 0.12.0 to 0.13.0 ([#17469](https://github.com/getsentry/sentry-javascript/pull/17469))
- feat(deps): bump @opentelemetry/instrumentation-mysql2 from 0.49.0 to 0.50.0 ([#17459](https://github.com/getsentry/sentry-javascript/pull/17459))
- feat(deps): bump @prisma/instrumentation from 6.13.0 to 6.14.0 ([#17466](https://github.com/getsentry/sentry-javascript/pull/17466))
- feat(deps): bump @sentry/cli from 2.51.1 to 2.52.0 ([#17458](https://github.com/getsentry/sentry-javascript/pull/17458))
- feat(deps): bump @sentry/rollup-plugin from 4.1.0 to 4.1.1 ([#17456](https://github.com/getsentry/sentry-javascript/pull/17456))
- feat(deps): bump @sentry/webpack-plugin from 4.1.0 to 4.1.1 ([#17467](https://github.com/getsentry/sentry-javascript/pull/17467))
- feat(replay): Add option to skip `requestAnimationFrame` for canvas snapshots ([#17380](https://github.com/getsentry/sentry-javascript/pull/17380))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- test(aws): Run E2E tests in all supported Node versions ([#17446](https://github.com/getsentry/sentry-javascript/pull/17446))

</details>

## 10.6.0

### Important Changes

- **feat(node): Add Anthropic AI integration ([#17348](https://github.com/getsentry/sentry-javascript/pull/17348))**

This release adds support for automatically tracing Anthropic AI SDK requests, providing better observability for AI-powered applications.

- **fix(core): Instrument invoke_agent root span, and support Vercel `ai` v5 ([#17395](https://github.com/getsentry/sentry-javascript/pull/17395))**

This release makes the Sentry `vercelAiIntegration` compatible with version 5 of Vercel `ai`.

- **docs(nuxt): Remove beta notice ([#17400](https://github.com/getsentry/sentry-javascript/pull/17400))**

The Sentry Nuxt SDK is now considered stable and no longer in beta!

### Other Changes

- feat(astro): Align options with shared build time options type ([#17396](https://github.com/getsentry/sentry-javascript/pull/17396))
- feat(aws): Add support for automatic wrapping in ESM ([#17407](https://github.com/getsentry/sentry-javascript/pull/17407))
- feat(node): Add an instrumentation interface for Hono ([#17366](https://github.com/getsentry/sentry-javascript/pull/17366))
- fix(browser): Use `DedicatedWorkerGlobalScope` global object type in `registerWebWorker` ([#17447](https://github.com/getsentry/sentry-javascript/pull/17447))
- fix(core): Only consider ingest endpoint requests when checking `isSentryRequestUrl` ([#17393](https://github.com/getsentry/sentry-javascript/pull/17393))
- fix(node): Fix preloading of instrumentation ([#17403](https://github.com/getsentry/sentry-javascript/pull/17403))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- chore: Add external contributor to CHANGELOG.md ([#17449](https://github.com/getsentry/sentry-javascript/pull/17449))
- chore(deps): bump astro from 4.16.18 to 4.16.19 in /dev-packages/e2e-tests/test-applications/astro-4 ([#17434](https://github.com/getsentry/sentry-javascript/pull/17434))
- test(e2e/firebase): Fix firebase e2e test failing due to outdated rules file ([#17448](https://github.com/getsentry/sentry-javascript/pull/17448))
- test(nextjs): Fix canary tests ([#17416](https://github.com/getsentry/sentry-javascript/pull/17416))
- test(nuxt): Don't rely on flushing for lowQualityTransactionFilter ([#17406](https://github.com/getsentry/sentry-javascript/pull/17406))
- test(solidstart): Don't rely on flushing for lowQualityTransactionFilter ([#17408](https://github.com/getsentry/sentry-javascript/pull/17408))

</details>

## 10.5.0

- feat(core): better cause data extraction ([#17375](https://github.com/getsentry/sentry-javascript/pull/17375))
- feat(deps): Bump @sentry/cli from 2.50.2 to 2.51.1 ([#17382](https://github.com/getsentry/sentry-javascript/pull/17382))
- feat(deps): Bump @sentry/rollup-plugin and @sentry/vite-plugin from 4.0.2 to 4.1.0 ([#17383](https://github.com/getsentry/sentry-javascript/pull/17383))
- feat(deps): Bump @sentry/webpack-plugin from 4.0.2 to 4.1.0 ([#17381](https://github.com/getsentry/sentry-javascript/pull/17381))
- feat(node): Capture `SystemError` context and remove paths from message ([#17331](https://github.com/getsentry/sentry-javascript/pull/17331))
- fix(nextjs): Inject Next.js version for dev symbolication ([#17379](https://github.com/getsentry/sentry-javascript/pull/17379))
- fix(mcp-server): Add defensive patches for Transport edge cases ([#17291](https://github.com/getsentry/sentry-javascript/pull/17291))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- chore(repo): Adjust "Publishing a Release" document to include internal changes section in changelog ([#17374](https://github.com/getsentry/sentry-javascript/pull/17374))
- test(aws): Run E2E tests with AWS SAM ([#17367](https://github.com/getsentry/sentry-javascript/pull/17367))
- test(node): Add tests for full http.server span attribute coverage ([#17373](https://github.com/getsentry/sentry-javascript/pull/17373))

</details>

Work in this release was contributed by @ha1fstack. Thank you for your contribution!

## 10.4.0

### Important Changes

- **fix(browser): Ensure IP address is only inferred by Relay if `sendDefaultPii` is `true`**

This release includes a fix for a [behaviour change](https://docs.sentry.io/platforms/javascript/migration/v8-to-v9/#behavior-changes)
that was originally introduced with v9 of the SDK: User IP Addresses should only be added to Sentry events automatically,
if `sendDefaultPii` was set to `true`.

However, the change in v9 required further internal adjustment, which should have been included in v10 of the SDK.
Unfortunately, the change did not make it into the initial v10 version but is now applied with `10.4.0`.
There is _no API_ breakage involved and hence it is safe to update.
However, after updating the SDK, events (errors, traces, replays, etc.) sent from the browser, will only include
user IP addresses, if you set `sendDefaultPii: true` in your `Sentry.init` options.

We apologize for any inconvenience caused!

- **feat(node): Add `ignoreStaticAssets` ([#17370](https://github.com/getsentry/sentry-javascript/pull/17370))**

This release adds a new option to `httpIntegration` to ignore requests for static assets (e.g. `favicon.xml` or `robots.txt`). The option defaults to `true`, meaning that going forward, such requests will not be traced by default. You can still enable tracing for these requests by setting the option to `false`:

```js
Sentry.init({
  integrations: [
    Sentry.httpIntegration({
      // defaults to true, set to false to enable traces for static assets
      ignoreStaticAssets: false,
    }),
  ],
});
```

### Other Changes

- fix(nuxt): Do not drop parametrized routes ([#17357](https://github.com/getsentry/sentry-javascript/pull/17357))

<details>
  <summary> <strong>Internal Changes</strong> </summary>

- ref(node): Split up incoming & outgoing http handling ([#17358](https://github.com/getsentry/sentry-javascript/pull/17358))
- test(node): Enable additionalDependencies in integration runner ([#17361](https://github.com/getsentry/sentry-javascript/pull/17361))

</details>

## 10.3.0

- feat(core): MCP Server - Capture prompt results from prompt function calls (#17284)
- feat(bun): Export `skipOpenTelemetrySetup` option ([#17349](https://github.com/getsentry/sentry-javascript/pull/17349))
- feat(sveltekit): Streamline build logs ([#17306](https://github.com/getsentry/sentry-javascript/pull/17306))
- fix(browser): Handle data urls in errors caught by `globalHandlersIntegration` ([#17216](https://github.com/getsentry/sentry-javascript/pull/17216))
- fix(browser): Improve navigation vs. redirect detection ([#17275](https://github.com/getsentry/sentry-javascript/pull/17275))
- fix(react-router): Ensure source map upload fails silently if Sentry CLI fails ([#17081](https://github.com/getsentry/sentry-javascript/pull/17081))
- fix(react): Add support for React Router sub-routes from `handle` ([#17277](https://github.com/getsentry/sentry-javascript/pull/17277))

## 10.2.0

### Important Changes

- **feat(core): Add `ignoreSpans` option ([#17078](https://github.com/getsentry/sentry-javascript/pull/17078))**

This release adds a new top-level `Sentry.init` option, `ignoreSpans`, that can be used as follows:

```js
Sentry.init({
  ignoreSpans: [
    'partial match', // string matching on the span name
    /regex/, // regex matching on the span name
    {
      name: 'span name',
      op: /http.client/,
    },
  ],
});
```

Spans matching the filter criteria will not be recorded. Potential child spans of filtered spans will be re-parented, if possible.

- **feat(cloudflare,vercel-edge): Add support for OpenAI instrumentation ([#17338](https://github.com/getsentry/sentry-javascript/pull/17338))**

Adds support for OpenAI manual instrumentation in `@sentry/cloudflare` and `@sentry/vercel-edge`.

To instrument the OpenAI client, wrap it with `Sentry.instrumentOpenAiClient` and set recording settings.

```js
import * as Sentry from '@sentry/cloudflare';
import OpenAI from 'openai';

const openai = new OpenAI();
const client = Sentry.instrumentOpenAiClient(openai, { recordInputs: true, recordOutputs: true });

// use the wrapped client
```

- **ref(aws): Remove manual span creation ([#17310](https://github.com/getsentry/sentry-javascript/pull/17310))**

The `startTrace` option is deprecated and will be removed in a future major version. If you want to disable tracing, set `SENTRY_TRACES_SAMPLE_RATE` to `0.0`. instead. As of today, the flag does not affect traces anymore.

### Other Changes

- feat(astro): Streamline build logs ([#17301](https://github.com/getsentry/sentry-javascript/pull/17301))
- feat(browser): Handles data URIs in chrome stack frames ([#17292](https://github.com/getsentry/sentry-javascript/pull/17292))
- feat(core): Accumulate tokens for `gen_ai.invoke_agent` spans from child LLM calls ([#17281](https://github.com/getsentry/sentry-javascript/pull/17281))
- feat(deps): Bump @prisma/instrumentation from 6.12.0 to 6.13.0 ([#17315](https://github.com/getsentry/sentry-javascript/pull/17315))
- feat(deps): Bump @sentry/cli from 2.50.0 to 2.50.2 ([#17316](https://github.com/getsentry/sentry-javascript/pull/17316))
- feat(deps): Bump @sentry/rollup-plugin from 4.0.0 to 4.0.2 ([#17317](https://github.com/getsentry/sentry-javascript/pull/17317))
- feat(deps): Bump @sentry/webpack-plugin from 4.0.0 to 4.0.2 ([#17314](https://github.com/getsentry/sentry-javascript/pull/17314))
- feat(nuxt): Do not inject trace meta-tags on cached HTML pages ([#17305](https://github.com/getsentry/sentry-javascript/pull/17305))
- feat(nuxt): Streamline build logs ([#17308](https://github.com/getsentry/sentry-javascript/pull/17308))
- feat(react-router): Add support for Hydrogen with RR7 ([#17145](https://github.com/getsentry/sentry-javascript/pull/17145))
- feat(react-router): Streamline build logs ([#17303](https://github.com/getsentry/sentry-javascript/pull/17303))
- feat(solidstart): Streamline build logs ([#17304](https://github.com/getsentry/sentry-javascript/pull/17304))
- fix(nestjs): Add missing `sentry.origin` span attribute to `SentryTraced` decorator ([#17318](https://github.com/getsentry/sentry-javascript/pull/17318))
- fix(node): Assign default export of `openai` to the instrumented fn ([#17320](https://github.com/getsentry/sentry-javascript/pull/17320))
- fix(replay): Call `sendBufferedReplayOrFlush` when opening/sending feedback ([#17236](https://github.com/getsentry/sentry-javascript/pull/17236))

## 10.1.0

- feat(nuxt): Align build-time options to follow bundler plugins structure ([#17255](https://github.com/getsentry/sentry-javascript/pull/17255))
- fix(browser-utils): Ensure web vital client hooks unsubscribe correctly ([#17272](https://github.com/getsentry/sentry-javascript/pull/17272))
- fix(browser): Ensure request from `diagnoseSdkConnectivity` doesn't create span ([#17280](https://github.com/getsentry/sentry-javascript/pull/17280))

## 10.0.0

Version `10.0.0` marks a release of the Sentry JavaScript SDKs that contains breaking changes. The goal of this release is to primarily upgrade the underlying OpenTelemetry dependencies to v2 with minimal breaking changes.

### How To Upgrade

Please carefully read through the migration guide in the Sentry docs on how to upgrade from version 9 to version 10. Make sure to select your specific platform/framework in the top left corner: https://docs.sentry.io/platforms/javascript/migration/v9-to-v10/

A comprehensive migration guide outlining all changes can be found within the Sentry JavaScript SDK Repository: https://github.com/getsentry/sentry-javascript/blob/develop/MIGRATION.md

### Breaking Changes

- feat!: Bump to OpenTelemetry v2 ([#16872](https://github.com/getsentry/sentry-javascript/pull/16872))
- feat(browser)!: Remove FID web vital collection ([#17076](https://github.com/getsentry/sentry-javascript/pull/17076))
- feat(core)!: Remove `BaseClient` ([#17071](https://github.com/getsentry/sentry-javascript/pull/17071))
- feat(core)!: Remove `enableLogs` and `beforeSendLog` experimental options ([#17063](https://github.com/getsentry/sentry-javascript/pull/17063))
- feat(core)!: Remove `hasTracingEnabled` ([#17072](https://github.com/getsentry/sentry-javascript/pull/17072))
- feat(core)!: Remove deprecated logger ([#17061](https://github.com/getsentry/sentry-javascript/pull/17061))
- feat(replay)!: Promote `_experiments.autoFlushOnFeedback` option as default ([#17220](https://github.com/getsentry/sentry-javascript/pull/17220))
- chore(deps)!: Bump bundler plugins to v4 ([#17089](https://github.com/getsentry/sentry-javascript/pull/17089))

### Other Changes

- feat(astro): Implement Request Route Parametrization for Astro 5 ([#17105](https://github.com/getsentry/sentry-javascript/pull/17105))
- feat(astro): Parametrize routes on client-side ([#17133](https://github.com/getsentry/sentry-javascript/pull/17133))
- feat(aws): Add `SentryNodeServerlessSDKv10` v10 AWS Lambda Layer ([#17069](https://github.com/getsentry/sentry-javascript/pull/17069))
- feat(aws): Create unified lambda layer for ESM and CJS ([#17012](https://github.com/getsentry/sentry-javascript/pull/17012))
- feat(aws): Detect SDK source for AWS Lambda layer ([#17128](https://github.com/getsentry/sentry-javascript/pull/17128))
- feat(core): Add missing openai tool calls attributes ([#17226](https://github.com/getsentry/sentry-javascript/pull/17226))
- feat(core): Add shared `flushIfServerless` function ([#17177](https://github.com/getsentry/sentry-javascript/pull/17177))
- feat(core): Implement `strictTraceContinuation` ([#16313](https://github.com/getsentry/sentry-javascript/pull/16313))
- feat(core): MCP server instrumentation without breaking Miniflare ([#16817](https://github.com/getsentry/sentry-javascript/pull/16817))
- feat(deps): bump @prisma/instrumentation from 6.11.1 to 6.12.0 ([#17117](https://github.com/getsentry/sentry-javascript/pull/17117))
- feat(meta): Unify detection of serverless environments and add Cloud Run ([#17168](https://github.com/getsentry/sentry-javascript/pull/17168))
- feat(nestjs): Switch to OTel core instrumentation ([#17068](https://github.com/getsentry/sentry-javascript/pull/17068))
- feat(node-native): Upgrade `@sentry-internal/node-native-stacktrace` to `0.2.2` ([#17207](https://github.com/getsentry/sentry-javascript/pull/17207))
- feat(node): Add `shouldHandleError` option to `fastifyIntegration` ([#16845](https://github.com/getsentry/sentry-javascript/pull/16845))
- feat(node): Add firebase integration ([#16719](https://github.com/getsentry/sentry-javascript/pull/16719))
- feat(node): Instrument stream responses for openai ([#17110](https://github.com/getsentry/sentry-javascript/pull/17110))
- feat(react-router): Add `createSentryHandleError` ([#17235](https://github.com/getsentry/sentry-javascript/pull/17235))
- feat(react-router): Automatically flush on serverless for loaders/actions ([#17234](https://github.com/getsentry/sentry-javascript/pull/17234))
- feat(react-router): Automatically flush on Vercel for request handlers ([#17232](https://github.com/getsentry/sentry-javascript/pull/17232))
- fix(astro): Construct parametrized route during runtime ([#17190](https://github.com/getsentry/sentry-javascript/pull/17190))
- fix(aws): Add layer build output to nx cache ([#17148](https://github.com/getsentry/sentry-javascript/pull/17148))
- fix(aws): Fix path to packages directory ([#17112](https://github.com/getsentry/sentry-javascript/pull/17112))
- fix(aws): Resolve all Sentry packages to local versions in layer build ([#17106](https://github.com/getsentry/sentry-javascript/pull/17106))
- fix(aws): Use file link in dependency version ([#17111](https://github.com/getsentry/sentry-javascript/pull/17111))
- fix(cloudflare): Allow non uuid workflow instance IDs ([#17121](https://github.com/getsentry/sentry-javascript/pull/17121))
- fix(cloudflare): Avoid turning DurableObject sync methods into async ([#17184](https://github.com/getsentry/sentry-javascript/pull/17184))
- fix(core): Fix OpenAI SDK private field access by binding non-instrumented fns ([#17163](https://github.com/getsentry/sentry-javascript/pull/17163))
- fix(core): Fix operation name for openai responses API ([#17206](https://github.com/getsentry/sentry-javascript/pull/17206))
- fix(core): Update ai.response.object to gen_ai.response.object ([#17153](https://github.com/getsentry/sentry-javascript/pull/17153))
- fix(nextjs): Flush in route handlers ([#17223](https://github.com/getsentry/sentry-javascript/pull/17223))
- fix(nextjs): Handle async params in url extraction ([#17162](https://github.com/getsentry/sentry-javascript/pull/17162))
- fix(nextjs): Update stackframe calls for next v15.5 ([#17156](https://github.com/getsentry/sentry-javascript/pull/17156))
- fix(node): Add mechanism to `fastifyIntegration` error handler ([#17208](https://github.com/getsentry/sentry-javascript/pull/17208))
- fix(node): Ensure tool errors for `vercelAiIntegration` have correct trace connected ([#17132](https://github.com/getsentry/sentry-javascript/pull/17132))
- fix(node): Fix exports for openai instrumentation ([#17238](https://github.com/getsentry/sentry-javascript/pull/17238))
- fix(node): Handle stack traces with data URI filenames ([#17218](https://github.com/getsentry/sentry-javascript/pull/17218))
- fix(react): Memoize wrapped component to prevent rerenders ([#17230](https://github.com/getsentry/sentry-javascript/pull/17230))
- fix(remix): Ensure source maps upload fails silently if Sentry CLI fails ([#17082](https://github.com/getsentry/sentry-javascript/pull/17082))
- fix(replay): Fix re-sampled sessions after a click ([#17008](https://github.com/getsentry/sentry-javascript/pull/17008))
- fix(svelte): Do not insert preprocess code in script module in Svelte 5 ([#17114](https://github.com/getsentry/sentry-javascript/pull/17114))
- fix(sveltekit): Align error status filtering and mechanism in `handleErrorWithSentry` ([#17157](https://github.com/getsentry/sentry-javascript/pull/17157))

Work in this release was contributed by @richardjelinek-fastest. Thank you for your contribution!

## 9.44.2

This release is publishing the AWS Lambda Layer under `SentryNodeServerlessSDKv9`. The previous release `9.44.1` accidentally published the layer under `SentryNodeServerlessSDKv10`.

## 9.44.1

- fix(replay/v9): Call sendBufferedReplayOrFlush when opening/sending feedback ([#17270](https://github.com/getsentry/sentry-javascript/pull/17270))

## 9.44.0

- feat(replay/v9): Deprecate `_experiments.autoFlushOnFeedback` ([#17219](https://github.com/getsentry/sentry-javascript/pull/17219))
- feat(v9/core): Add shared `flushIfServerless` function ([#17239](https://github.com/getsentry/sentry-javascript/pull/17239))
- feat(v9/node-native): Upgrade `@sentry-internal/node-native-stacktrace` to `0.2.2` ([#17256](https://github.com/getsentry/sentry-javascript/pull/17256))
- feat(v9/react-router): Add `createSentryHandleError` ([#17244](https://github.com/getsentry/sentry-javascript/pull/17244))
- feat(v9/react-router): Automatically flush on serverless for loaders/actions ([#17243](https://github.com/getsentry/sentry-javascript/pull/17243))
- feat(v9/react-router): Automatically flush on serverless for request handler ([#17242](https://github.com/getsentry/sentry-javascript/pull/17242))
- fix(v9/astro): Construct parametrized route during runtime ([#17227](https://github.com/getsentry/sentry-javascript/pull/17227))
- fix(v9/nextjs): Flush in route handlers ([#17245](https://github.com/getsentry/sentry-javascript/pull/17245))
- fix(v9/node): Fix exports for openai instrumentation ([#17238](https://github.com/getsentry/sentry-javascript/pull/17238)) (#17241)

## 9.43.0

- feat(v9/core): add MCP server instrumentation ([#17196](https://github.com/getsentry/sentry-javascript/pull/17196))
- feat(v9/meta): Unify detection of serverless environments and add Cloud Run ([#17204](https://github.com/getsentry/sentry-javascript/pull/17204))
- fix(v9/node): Add mechanism to `fastifyIntegration` error handler ([#17211](https://github.com/getsentry/sentry-javascript/pull/17211))
- fix(v9/replay): Fix re-sampled sessions after a click ([#17195](https://github.com/getsentry/sentry-javascript/pull/17195))

## 9.42.1

- fix(v9/astro): Revert Astro v5 storing route data to `globalThis` ([#17185](https://github.com/getsentry/sentry-javascript/pull/17185))
- fix(v9/cloudflare): Avoid turning DurableObject sync methods into async ([#17187](https://github.com/getsentry/sentry-javascript/pull/17187))
- fix(v9/nextjs): Handle async params in url extraction ([#17176](https://github.com/getsentry/sentry-javascript/pull/17176))
- fix(v9/sveltekit): Align error status filtering and mechanism in `handleErrorWithSentry` ([#17174](https://github.com/getsentry/sentry-javascript/pull/17174))

## 9.42.0

- feat(v9/aws): Detect SDK source for AWS Lambda layer ([#17150](https://github.com/getsentry/sentry-javascript/pull/17150))
- fix(v9/core): Fix OpenAI SDK private field access by binding non-instrumented fns ([#17167](https://github.com/getsentry/sentry-javascript/pull/17167))
- fix(v9/core): Update ai.response.object to gen_ai.response.object ([#17155](https://github.com/getsentry/sentry-javascript/pull/17155))
- fix(v9/nextjs): Update stackframe calls for next v15.5 ([#17161](https://github.com/getsentry/sentry-javascript/pull/17161))

## 9.41.0

### Important Changes

- **feat(v9/core): Deprecate experimental `enableLogs` and `beforeSendLog` option ([#17092](https://github.com/getsentry/sentry-javascript/pull/17092))**

Sentry now has support for [structured logging](https://docs.sentry.io/product/explore/logs/getting-started/). Previously to enable structured logging, you had to use the `_experiments.enableLogs` and `_experiments.beforeSendLog` options. These options have been deprecated in favor of the top-level `enableLogs` and `beforeSendLog` options.

```js
// before
Sentry.init({
  _experiments: {
    enableLogs: true,
    beforeSendLog: log => {
      return log;
    },
  },
});

// after
Sentry.init({
  enableLogs: true,
  beforeSendLog: log => {
    return log;
  },
});
```

- **feat(astro): Implement parameterized routes**
  - feat(v9/astro): Parametrize dynamic server routes ([#17141](https://github.com/getsentry/sentry-javascript/pull/17141))
  - feat(v9/astro): Parametrize routes on client-side ([#17143](https://github.com/getsentry/sentry-javascript/pull/17143))

Server-side and client-side parameterized routes are now supported in the Astro SDK. No configuration changes are required.

### Other Changes

- feat(v9/node): Add shouldHandleError option to fastifyIntegration ([#17123](https://github.com/getsentry/sentry-javascript/pull/17123))
- fix(v9/cloudflare) Allow non UUID workflow instance IDs ([#17135](https://github.com/getsentry/sentry-javascript/pull/17135))
- fix(v9/node): Ensure tool errors for `vercelAiIntegration` have correct trace ([#17142](https://github.com/getsentry/sentry-javascript/pull/17142))
- fix(v9/remix): Ensure source maps upload fails silently if Sentry CLI fails ([#17095](https://github.com/getsentry/sentry-javascript/pull/17095))
- fix(v9/svelte): Do not insert preprocess code in script module in Svelte 5 ([#17124](https://github.com/getsentry/sentry-javascript/pull/17124))

Work in this release was contributed by @richardjelinek-fastest. Thank you for your contribution!

## 9.40.0

### Important Changes

- **feat(browser): Add debugId sync APIs between web worker and main thread ([#16981](https://github.com/getsentry/sentry-javascript/pull/16981))**

This release adds two Browser SDK APIs to let the main thread know about debugIds of worker files:

- `webWorkerIntegration({worker})` to be used in the main thread
- `registerWebWorker({self})` to be used in the web worker

```js
// main.js
Sentry.init({...})

const worker = new MyWorker(...);

Sentry.addIntegration(Sentry.webWorkerIntegration({ worker }));

worker.addEventListener('message', e => {...});
```

```js
// worker.js
Sentry.registerWebWorker({ self });

self.postMessage(...);
```

- **feat(core): Deprecate logger in favor of debug ([#17040](https://github.com/getsentry/sentry-javascript/pull/17040))**

The internal SDK `logger` export from `@sentry/core` has been deprecated in favor of the `debug` export. `debug` only exposes `log`, `warn`, and `error` methods but is otherwise identical to `logger`. Note that this deprecation does not affect the `logger` export from other packages (like `@sentry/browser` or `@sentry/node`) which is used for Sentry Logging.

```js
import { logger, debug } from '@sentry/core';

// before
logger.info('This is an info message');

// after
debug.log('This is an info message');
```

- **feat(node): Add OpenAI integration ([#17022](https://github.com/getsentry/sentry-javascript/pull/17022))**

This release adds official support for instrumenting OpenAI SDK calls in with Sentry tracing, following OpenTelemetry semantic conventions for Generative AI. It instruments:

- `client.chat.completions.create()` - For chat-based completions
- `client.responses.create()` - For the responses API

```js
// The integration respects your `sendDefaultPii` option, but you can override the behavior in the integration options

Sentry.init({
  dsn: '__DSN__',
  integrations: [
    Sentry.openAIIntegration({
      recordInputs: true, // Force recording prompts
      recordOutputs: true, // Force recording responses
    }),
  ],
});
```

### Other Changes

- feat(node-core): Expand `@opentelemetry/instrumentation` range to cover `0.203.0` ([#17043](https://github.com/getsentry/sentry-javascript/pull/17043))
- fix(cloudflare): Ensure errors get captured from durable objects ([#16838](https://github.com/getsentry/sentry-javascript/pull/16838))
- fix(sveltekit): Ensure server errors from streamed responses are sent ([#17044](https://github.com/getsentry/sentry-javascript/pull/17044))

Work in this release was contributed by @0xbad0c0d3 and @tommy-gilligan. Thank you for your contributions!

## 9.39.0

### Important Changes

- **feat(browser): Add `afterStartPageloadSpan` hook to improve spanId assignment on web vital spans ([#16893](https://github.com/getsentry/sentry-javascript/pull/16893))**

This PR adds a new afterStartPageloadSpan lifecycle hook to more robustly assign the correct pageload span ID to web vital spans, replacing the previous unreliable "wait for a tick" approach with a direct callback that fires when the pageload span becomes available.

- **feat(nextjs): Client-side parameterized routes ([#16934](https://github.com/getsentry/sentry-javascript/pull/16934))**

This PR implements client-side parameterized routes for Next.js by leveraging an injected manifest within the existing app-router instrumentation to automatically parameterize all client-side transactions (e.g. `users/123` and `users/456` now become become `users/:id`).

- **feat(node): Drop 401-404 and 3xx status code spans by default ([#16972](https://github.com/getsentry/sentry-javascript/pull/16972))**

This PR changes the default behavior in the Node SDK to drop HTTP spans with 401-404 and 3xx status codes by default to reduce noise in tracing data.

### Other Changes

- feat(core): Prepend vercel ai attributes with `vercel.ai.X` ([#16908](https://github.com/getsentry/sentry-javascript/pull/16908))
- feat(nextjs): Add `disableSentryWebpackConfig` flag ([#17013](https://github.com/getsentry/sentry-javascript/pull/17013))
- feat(nextjs): Build app manifest ([#16851](https://github.com/getsentry/sentry-javascript/pull/16851))
- feat(nextjs): Inject manifest into client for turbopack builds ([#16902](https://github.com/getsentry/sentry-javascript/pull/16902))
- feat(nextjs): Inject manifest into client for webpack builds ([#16857](https://github.com/getsentry/sentry-javascript/pull/16857))
- feat(node-native): Add option to disable event loop blocked detection ([#16919](https://github.com/getsentry/sentry-javascript/pull/16919))
- feat(react-router): Ensure http.server route handling is consistent ([#16986](https://github.com/getsentry/sentry-javascript/pull/16986))
- fix(core): Avoid prolonging idle span when starting standalone span ([#16928](https://github.com/getsentry/sentry-javascript/pull/16928))
- fix(core): Remove side-effect from `tracing/errors.ts` ([#16888](https://github.com/getsentry/sentry-javascript/pull/16888))
- fix(core): Wrap `beforeSendLog` in `consoleSandbox` ([#16968](https://github.com/getsentry/sentry-javascript/pull/16968))
- fix(node-core): Apply correct SDK metadata ([#17014](https://github.com/getsentry/sentry-javascript/pull/17014))
- fix(react-router): Ensure that all browser spans have `source=route` ([#16984](https://github.com/getsentry/sentry-javascript/pull/16984))

Work in this release was contributed by @janpapenbrock. Thank you for your contribution!

## 9.38.0

### Important Changes

- **chore: Add craft entry for @sentry/node-native ([#16907](https://github.com/getsentry/sentry-javascript/pull/16907))**

This release publishes the `@sentry/node-native` SDK.

### Other Changes

- feat(core): Introduce `debug` to replace `logger` ([#16906](https://github.com/getsentry/sentry-javascript/pull/16906))
- fix(browser): Guard `nextHopProtocol` when adding resource spans ([#16900](https://github.com/getsentry/sentry-javascript/pull/16900))

## 9.37.0

### Important Changes

- **feat(nuxt): Parametrize SSR routes ([#16843](https://github.com/getsentry/sentry-javascript/pull/16843))**

  When requesting dynamic or catch-all routes in Nuxt, those will now be shown as parameterized routes in Sentry.
  For example, `/users/123` will be shown as `/users/:userId()` in Sentry. This will make it easier to identify patterns and make grouping easier.

### Other Changes

- feat(astro): Deprecate passing runtime config to astro integration ([#16839](https://github.com/getsentry/sentry-javascript/pull/16839))
- feat(browser): Add `beforeStartNavigationSpan` lifecycle hook ([#16863](https://github.com/getsentry/sentry-javascript/pull/16863))
- feat(browser): Detect redirects when emitting navigation spans ([#16324](https://github.com/getsentry/sentry-javascript/pull/16324))
- feat(cloudflare): Add option to opt out of capturing errors in `wrapRequestHandler` ([#16852](https://github.com/getsentry/sentry-javascript/pull/16852))
- feat(feedback): Return the eventId into the onSubmitSuccess callback ([#16835](https://github.com/getsentry/sentry-javascript/pull/16835))
- feat(vercel-edge): Do not vendor in all OpenTelemetry dependencies ([#16841](https://github.com/getsentry/sentry-javascript/pull/16841))
- fix(browser): Ensure standalone CLS and LCP spans have traceId of pageload span ([#16864](https://github.com/getsentry/sentry-javascript/pull/16864))
- fix(nextjs): Use value injection loader on `instrumentation-client.ts|js` ([#16855](https://github.com/getsentry/sentry-javascript/pull/16855))
- fix(sveltekit): Avoid capturing `redirect()` calls as errors in Cloudflare ([#16853](https://github.com/getsentry/sentry-javascript/pull/16853))
- docs(nextjs): Update `deleteSourcemapsAfterUpload` jsdoc default value ([#16867](https://github.com/getsentry/sentry-javascript/pull/16867))

Work in this release was contributed by @zachkirsch. Thank you for your contribution!

## 9.36.0

### Important Changes

- **feat(node-core): Add node-core SDK ([#16745](https://github.com/getsentry/sentry-javascript/pull/16745))**

This release adds a new SDK `@sentry/node-core` which ships without any OpenTelemetry instrumententation out of the box. All OpenTelemetry dependencies are peer dependencies and OpenTelemetry has to be set up manually.

Use `@sentry/node-core` when:

- You already have OpenTelemetry set up
- You need custom OpenTelemetry configuration
- You want minimal dependencies
- You need fine-grained control over instrumentation

Use `@sentry/node` when:

- You want an automatic setup
- You're new to OpenTelemetry
- You want sensible defaults
- You prefer convenience over control

* **feat(node): Deprecate ANR integration ([#16832](https://github.com/getsentry/sentry-javascript/pull/16832))**

The ANR integration has been deprecated and will be removed in future versions. Use `eventLoopBlockIntegration` from `@sentry/node-native` instead.

- **feat(replay): Add `_experiments.ignoreMutations` option ([#16816](https://github.com/getsentry/sentry-javascript/pull/16816))**

This replay option allows to configure a selector list of elements to not capture mutations for.

```js
Sentry.replayIntegration({
  _experiments: {
    ignoreMutations: ['.dragging'],
  },
});
```

### Other changes

- feat(deps): bump @prisma/instrumentation from 6.10.1 to 6.11.1 ([#16833](https://github.com/getsentry/sentry-javascript/pull/16833))
- feat(nextjs): Add flag for suppressing router transition warning ([#16823](https://github.com/getsentry/sentry-javascript/pull/16823))
- feat(nextjs): Automatically skip middleware requests for tunnel route ([#16812](https://github.com/getsentry/sentry-javascript/pull/16812))
- feat(replay): Export compression worker from `@sentry/replay-internal` ([#16794](https://github.com/getsentry/sentry-javascript/pull/16794))
- fix(browser): Avoid 4xx response for succesful `diagnoseSdkConnectivity` request ([#16840](https://github.com/getsentry/sentry-javascript/pull/16840))
- fix(browser): Guard against undefined nextHopProtocol ([#16806](https://github.com/getsentry/sentry-javascript/pull/16806))
- fix(cloudflare): calculate retries not attempts ([#16834](https://github.com/getsentry/sentry-javascript/pull/16834))
- fix(nuxt): Parametrize routes on the server-side ([#16785](https://github.com/getsentry/sentry-javascript/pull/16785))
- fix(vue): Make pageload span handling more reliable ([#16799](https://github.com/getsentry/sentry-javascript/pull/16799))

Work in this release was contributed by @Spice-King and @stayallive. Thank you for your contributions!

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

## 8.x

A full list of changes in the `8.x` release of the SDK can be found in the [8.x Changelog](./docs/changelog/v8.md).

## 7.x

A full list of changes in the `7.x` release of the SDK can be found in the [7.x Changelog](./docs/changelog/v7.md).

## 6.x

A full list of changes in the `6.x` release of the SDK can be found in the [6.x Changelog](./docs/changelog/v6.md).

## 5.x

A full list of changes in the `5.x` release of the SDK can be found in the [5.x Changelog](./docs/changelog/v5.md).

## 4.x

A full list of changes in the `4.x` release of the SDK can be found in the [4.x Changelog](./docs/changelog/v4.md).
