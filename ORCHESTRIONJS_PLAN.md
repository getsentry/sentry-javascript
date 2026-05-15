# Orchestrion.js Auto-Instrumentation Experiment Plan

> Experiment branch: `experiment/orchestrionjs-auto-instrumentation`
>
> Goal: prototype a future where `@sentry/node` does its own auto-instrumentation
> via Node.js [`TracingChannel`](https://nodejs.org/api/diagnostics_channel.html#class-tracingchannel),
> with channel injection driven by [orchestrion.js](https://github.com/nodejs/orchestrion-js)
> instead of OpenTelemetry's `require-in-the-middle` / `import-in-the-middle` machinery.
>
> First target: the `mysql` integration.

## Background

Orchestrion-JS is published as three coordinated packages:

| Package                                           | What it does                                                                                                                                      | We use it for                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `@apm-js-collab/code-transformer`                 | Rust/WASM AST walker. Given an `InstrumentationConfig[]`, returns a `Transformer` that rewrites function bodies to publish to a `TracingChannel`. | Indirectly — via the two below.   |
| `@apm-js-collab/tracing-hooks`                    | Node ESM loader (`register('@apm-js-collab/tracing-hooks/hook.mjs', ..., { data: { instrumentations } })`) + a CJS `ModulePatch` for `--require`. | **Runtime** channel injection.    |
| `@apm-js-collab/code-transformer-bundler-plugins` | One plugin per bundler (`/vite`, `/webpack`, `/rollup`, `/esbuild`), all taking the same `{ instrumentations }` object.                           | **Build-time** channel injection. |

All three accept the same `InstrumentationConfig` shape:

```ts
type InstrumentationConfig = {
  channelName: string; // diagnostics_channel TracingChannel name
  module: { name: string; versionRange: string; filePath: string };
  functionQuery: FunctionQuery; // className+methodName / functionName / expressionName / ...
};
```

This means **one config array** can drive both the runtime hook and every bundler plugin — that is the leverage point this plan is built around.

## Architectural goals

1. **Integrations only know channels.** A Sentry integration (e.g. `mysqlIntegration`) subscribes to a published channel name and creates spans. It never imports orchestrion, never knows how the channel got there, and would work identically against a native `diagnostics_channel` that some library already publishes itself.
2. **Single source of truth for orchestrion config.** Channel names + module matchers + function queries live in **one** TypeScript module. Both the runtime hook and the bundler plugin import from it. Adding a new instrumentation = one edit.
3. **Two equally good user paths, one of which must be active.**
   - **Bundler path** (preferred when bundling): the user adds `sentryOrchestrionPlugin()` to their `vite.config.ts`. Nothing else.
   - **Runtime path** (preferred for unbundled Node servers): the user runs `node --import @sentry/node/orchestrion app.js` (ESM) or `node --require @sentry/node/orchestrion app.js` (CJS). The same import path resolves to the ESM `import-hook.mjs` or the CJS `require-hook.cjs` based on the active loader condition, so the user doesn't have to know which one to pick.
4. **Loud about misconfiguration.** When orchestrion setup runs, the SDK must detect (a) "no orchestrion hook was set up at all" and (b) "both paths ran — code is double-wrapped" and warn clearly.
5. **No mixing with the existing OTel-based init, and tree-shakable.** The opt-in is split into two pieces so users who don't opt in never pull in any orchestrion code:
   - A new `_experimentalUseOrchestrion: true` flag on `Sentry.init()` that does the _base_ adjustments — i.e. skip registering the OTel auto-instrumentations that have a channel-based replacement (mysql, …). This is all `init()` itself does; it pulls in zero orchestrion-specific code.
   - A new top-level export `_experimentalSetupOrchestrion()` that the user calls **after** `Sentry.init()`. This is where all orchestrion-specific code lives: the channel subscribers, the integration registrations, and the runtime/bundler detection warnings. If the user never calls it, the bundler can drop everything under `orchestrion/` from their bundle.
     When the flag is unset (the default), `init()` behaves exactly as today and `_experimentalSetupOrchestrion` — if imported — is a no-op that only warns. Existing users keep using `@opentelemetry/instrumentation-*` integrations untouched.

## Repository layout

All new code lives under `packages/node/`. The existing OTel-based mysql integration stays untouched so we can A/B them.

```
packages/node/
├── package.json                                  (NEW subpath exports — see below)
└── src/
    └── orchestrion/                              (NEW directory — all experiment code)
        ├── index.ts                              public re-exports for the integrations subdir
        ├── setup.ts                              ★ _experimentalSetupOrchestrion() — the only user-facing entry into this dir
        ├── config.ts                             ★ central InstrumentationConfig[] — single source of truth
        ├── channels.ts                           channel-name string constants (imported by configs AND integrations)
        ├── detect.ts                             globalThis marker + warning logic
        ├── runtime/
        │   ├── import-hook.mjs                   --import target: register() + marker
        │   └── require-hook.cjs                  --require target: ModulePatch.patch() + marker
        └── bundler/
            ├── vite.ts                           sentryOrchestrionVitePlugin() — wraps code-transformer/vite + marker
            └── marker-banner.ts                  shared "inject `globalThis.__SENTRY_ORCHESTRION__.bundler = true`" plugin
packages/node/src/integrations/tracing-channel/
    └── mysql.ts                                            ★ subscribes to channels; creates Sentry spans
```

All channel-consumer integrations live together under `integrations/tracing-channel/` — one file per library (`mysql.ts`, future `pg.ts`, `redis.ts`, …). This mirrors the existing `integrations/tracing/` layout for the OTel path, keeps related code visually grouped, and makes the boundary the user wants explicit: a contributor adding a new channel-driven integration edits `orchestrion/config.ts` (one entry) + `integrations/tracing-channel/<lib>.ts` (one subscriber) + adds it to the default list in `orchestrion/setup.ts`. Nothing else.

`orchestrion/setup.ts` is the **only** file under `orchestrion/` that user code imports from at runtime (via the top-level `@sentry/node` re-export of `_experimentalSetupOrchestrion`). Everything else under `orchestrion/` is reachable only transitively through that one entry point — which is what makes the experiment tree-shakable for opted-out users.

## Central config — the load-bearing file

`packages/node/src/orchestrion/channels.ts`

```ts
// String constants shared between config.ts (producer) and integrations (consumer).
// Single source of truth for channel names — keeps the channel string from being
// misspelled in one place and silently never firing.
export const CHANNELS = {
  MYSQL_QUERY: 'sentry:mysql:query',
} as const;
```

`packages/node/src/orchestrion/config.ts`

```ts
import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';
import { CHANNELS } from './channels';

export const SENTRY_INSTRUMENTATIONS: InstrumentationConfig[] = [
  {
    channelName: CHANNELS.MYSQL_QUERY,
    module: { name: 'mysql', versionRange: '>=2.0.0', filePath: 'lib/Connection.js' },
    functionQuery: { className: 'Connection', methodName: 'query', kind: 'Callback' },
  },
  // … future entries: mysql2, pg, redis, etc. One line per instrumented method.
];
```

`config.ts` has **no side effects** — it is the only thing both `runtime/*` and `bundler/*` import. This is what makes it cheap to maintain: adding a new instrumented method is one entry here + one subscriber file.

## The integration — channel consumer

`packages/node/src/integrations/tracing-channel/mysql.ts` (sketch):

```ts
import { channel, tracingChannel } from 'node:diagnostics_channel';
import { defineIntegration, startSpan, SPAN_STATUS_ERROR } from '@sentry/core';
import { CHANNELS } from '../../orchestrion/channels';

const _mysqlChannelIntegration = (() => {
  const queryCh = tracingChannel(CHANNELS.MYSQL_QUERY);
  // store per-context state on a WeakMap keyed by the `context` object
  // that orchestrion passes to start/end/asyncStart/asyncEnd/error.
  const spans = new WeakMap<object, { finish: () => void }>();

  return {
    name: 'MysqlChannel',
    setupOnce() {
      queryCh.subscribe({
        start(ctx) {
          // ctx.arguments contains the original call args — extract SQL for span name.
          const sql = String((ctx as any).arguments?.[0] ?? 'mysql.query');
          // startSpan returns synchronously when we pass `{ forceTransaction: false }` semantics;
          // for true async correlation we wrap startInactiveSpan + manual end here.
          const span = startInactiveSpanForChannel(sql);
          spans.set(ctx as object, {
            finish: () => span.end(),
          });
        },
        error(ctx) {
          // pull error from ctx, mark span status
        },
        asyncEnd(ctx) {
          spans.get(ctx as object)?.finish();
        },
        // end() fires for sync paths; asyncEnd() for callback / promise paths
        end(ctx) {
          // only finish if asyncEnd hasn't (mysql Connection.query is callback-based — asyncEnd is the one)
        },
      });
    },
  };
}) satisfies IntegrationFn;

export const mysqlChannelIntegration = defineIntegration(_mysqlChannelIntegration);
```

The integration imports **`CHANNELS.MYSQL_QUERY`, not the orchestrion config**. It is unaware orchestrion exists; if some day `mysql` publishes that channel natively we just stop injecting it.

## Subpath exports

Add to `packages/node/package.json`:

```jsonc
"exports": {
  // … existing entries …
  "./orchestrion": {
    // Single subpath, two condition arms — Node picks the right file based on
    // whether the user passed `--import` (ESM hook) or `--require` (CJS hook).
    "import": { "default": "./build/orchestrion/import-hook.mjs" },
    "require": { "default": "./build/orchestrion/require-hook.cjs" }
  },
  "./orchestrion/vite": {
    // Vite plugin factory.
    "import": { "types": "./build/types/orchestrion/bundler/vite.d.ts", "default": "./build/esm/orchestrion/bundler/vite.js" },
    "require": { "types": "./build/types/orchestrion/bundler/vite.d.ts", "default": "./build/cjs/orchestrion/bundler/vite.js" }
  }
}
```

End-user friction is minimized: either

```bash
node --import @sentry/node/orchestrion app.js
```

or

```ts
// vite.config.ts
import { sentryOrchestrionPlugin } from '@sentry/node/orchestrion/vite';
export default { plugins: [sentryOrchestrionPlugin()] };
```

No `instrumentations: [...]` array to copy-paste, no channel names to remember.

## Runtime hook — `--import` ESM target

`packages/node/src/orchestrion/runtime/import-hook.mjs`

```js
import { register } from 'node:module';
import { SENTRY_INSTRUMENTATIONS } from '../config.js';

// 1) Double-wrap guard. Set this BEFORE register() so even if a second --import
//    is added, we won't double-register.
const g = (globalThis.__SENTRY_ORCHESTRION__ ??= {});
if (g.runtime) {
  console.warn('[Sentry] @sentry/node/orchestrion was loaded twice via --import. Ignoring the second load.');
} else {
  g.runtime = true;
  register('@apm-js-collab/tracing-hooks/hook.mjs', import.meta.url, {
    data: { instrumentations: SENTRY_INSTRUMENTATIONS },
  });
}
```

`packages/node/src/orchestrion/runtime/require-hook.cjs`

```js
const ModulePatch = require('@apm-js-collab/tracing-hooks');
const { SENTRY_INSTRUMENTATIONS } = require('../config.js');

const g = (globalThis.__SENTRY_ORCHESTRION__ ??= {});
if (g.runtime) {
  console.warn('[Sentry] @sentry/node/orchestrion was loaded twice via --require. Ignoring.');
} else {
  g.runtime = true;
  new ModulePatch({ instrumentations: SENTRY_INSTRUMENTATIONS }).patch();
}
```

Both files set `globalThis.__SENTRY_ORCHESTRION__.runtime = true`. That marker is how `detect.ts` knows the runtime path is active later.

## Vite plugin — build-time path

`packages/node/src/orchestrion/bundler/vite.ts`

```ts
import codeTransformer from '@apm-js-collab/code-transformer-bundler-plugins/vite';
import type { Plugin } from 'vite';
import { SENTRY_INSTRUMENTATIONS } from '../config';

export function sentryOrchestrionPlugin(): Plugin[] {
  return [
    // 1) Inject the runtime marker into the bundle so detect.ts can see it.
    markerPlugin(),
    // 2) The actual orchestrion transformer, fed our central config.
    codeTransformer({ instrumentations: SENTRY_INSTRUMENTATIONS }),
  ];
}

function markerPlugin(): Plugin {
  // Emits/injects a one-liner into the bundle output:
  //   globalThis.__SENTRY_ORCHESTRION__ = (globalThis.__SENTRY_ORCHESTRION__ || {});
  //   if (globalThis.__SENTRY_ORCHESTRION__.bundler) { console.warn('[Sentry] orchestrion bundler plugin loaded twice'); }
  //   globalThis.__SENTRY_ORCHESTRION__.bundler = true;
  return {
    name: 'sentry-orchestrion-marker',
    enforce: 'pre',
    // Easiest: hook `renderChunk` and prepend to entry chunks.
    // Alternative: emit a virtual module + use `banner` config injection.
    // To be decided during implementation — both work; the renderChunk approach
    // avoids requiring the user to import anything.
  };
}
```

**Design decision — where the marker comes from in the bundler path:**
the plugin injects runtime JS into the bundle, not just a build-time flag. Build-time markers (e.g. `define`) are useless to `detect.ts`, which runs at app start. The marker must execute when the bundled app boots.

## Detection — `detect.ts`

`packages/node/src/orchestrion/detect.ts`

```ts
import { logger } from '@sentry/core';

declare global {
  // eslint-disable-next-line no-var
  var __SENTRY_ORCHESTRION__: { runtime?: boolean; bundler?: boolean } | undefined;
}

export function detectOrchestrionSetup(): void {
  const marker = globalThis.__SENTRY_ORCHESTRION__;
  const runtime = !!marker?.runtime;
  const bundler = !!marker?.bundler;

  if (runtime && bundler) {
    logger.warn(
      '[Sentry] Detected BOTH the @sentry/node/orchestrion runtime hook AND the bundler plugin. ' +
        'Functions will be instrumented twice and produce duplicate spans. ' +
        'Remove `--import @sentry/node/orchestrion` if you are using the bundler plugin, or vice versa.',
    );
    return;
  }

  if (!runtime && !bundler) {
    logger.warn(
      '[Sentry] No auto-instrumentation hook detected. Channel-based integrations (mysql, …) will not record spans. ' +
        'Either run with `node --import @sentry/node/orchestrion app.js`, or add `sentryOrchestrionPlugin()` to your bundler config.',
    );
  }
}
```

## Two-step user setup — flag on `init()` + `_experimentalSetupOrchestrion()`

The opt-in is deliberately split so the orchestrion code path stays tree-shakable. `Sentry.init()` only learns about a boolean flag; it does **not** import anything from `orchestrion/`. The orchestrion-specific code only runs if the user explicitly imports and calls `_experimentalSetupOrchestrion()` after `init()`.

### Step 1 — `_experimentalUseOrchestrion` flag on `NodeOptions`

```ts
// packages/node-core/src/types.ts (or wherever NodeOptions lives)
export interface NodeOptions extends ClientOptions {
  // … existing options …
  /**
   * EXPERIMENTAL — opt into the orchestrion.js-based auto-instrumentation path.
   * When `true`, `Sentry.init()` will skip registering the default OTel
   * auto-instrumentations for libraries that have a channel-based alternative
   * (mysql, …). It does **not** install any channel subscribers on its own —
   * call `_experimentalSetupOrchestrion()` after `init()` for that.
   *
   * Defaults to `false`. The flag name is intentionally underscore-prefixed and
   * will be renamed or removed once the experiment graduates.
   */
  _experimentalUseOrchestrion?: boolean;
}
```

```ts
// packages/node/src/sdk/index.ts (sketch of the additional lines in init())
export function init(options: NodeOptions | undefined = {}): NodeClient | undefined {
  // … existing init body, with one change: when assembling the default integrations
  // list, skip entries whose libraries are covered by the orchestrion experiment.
  if (options._experimentalUseOrchestrion) {
    defaultIntegrations = defaultIntegrations.filter(i => !ORCHESTRION_REPLACED_INTEGRATIONS.has(i.name));
  }
  // … the rest of init() is unchanged, and crucially does NOT import from ../orchestrion/* …
}

// A tiny string-set constant — no orchestrion code imported.
const ORCHESTRION_REPLACED_INTEGRATIONS = new Set<string>([
  'Mysql', // matches the existing OTel mysql integration's `name`
]);
```

The list of replaced integration names is a plain string set defined alongside `init()` itself — it does not import from `orchestrion/`, so toggling the flag doesn't pull orchestrion code into a user's bundle.

### Step 2 — `_experimentalSetupOrchestrion()` as a separate export

```ts
// packages/node/src/orchestrion/setup.ts
import { logger } from '@sentry/core';
import type { NodeClient } from '../sdk/client';
import { detectOrchestrionSetup } from './detect';
import { mysqlChannelIntegration } from '../integrations/tracing-channel/mysql';

export interface ExperimentalSetupOrchestrionOptions {
  /**
   * Override or extend the default set of channel-based integrations.
   * If omitted, all orchestrion integrations shipped by @sentry/node are added.
   */
  integrations?: Integration[];
}

export function _experimentalSetupOrchestrion(
  client: NodeClient | undefined,
  options: ExperimentalSetupOrchestrionOptions = {},
): void {
  if (!client) {
    logger.warn(
      '[Sentry] _experimentalSetupOrchestrion() was called without a client. ' +
        'Pass the value returned by `Sentry.init()`.',
    );
    return;
  }
  if (!client.getOptions()._experimentalUseOrchestrion) {
    logger.warn(
      '[Sentry] _experimentalSetupOrchestrion() called but Sentry.init() was not given ' +
        '`_experimentalUseOrchestrion: true`. The default OTel integrations are still active — ' +
        'you will get duplicate spans. Add the flag to Sentry.init().',
    );
  }

  // 1) Verify the runtime/bundler hook actually ran.
  detectOrchestrionSetup();

  // 2) Register the channel-based integrations on the passed-in client.
  const integrations = options.integrations ?? [
    mysqlChannelIntegration(),
    // … future channel integrations default-on here.
  ];
  for (const integration of integrations) {
    client.addIntegration(integration);
  }
}
```

Taking the client as an explicit argument (instead of pulling it from `getClient()`) makes the call order unambiguous, avoids surprises when multiple clients exist (tests, multi-tenant setups), and gives TypeScript users a clear type on what `_experimentalSetupOrchestrion` operates against.

`_experimentalSetupOrchestrion` is the **only** export through which orchestrion-specific code is reachable from a user's app graph. Bundlers can statically determine that an app which never imports it has no live edges into `orchestrion/`, so all the channel subscribers, detection code, and integration factories drop out.

The function is also where we sanity-check the user's setup: it warns if `init()` wasn't told about the flag, and it runs `detectOrchestrionSetup()` to confirm exactly one of the runtime / bundler paths is active.

### Usage

```ts
import * as Sentry from '@sentry/node';
import { _experimentalSetupOrchestrion } from '@sentry/node';

const client = Sentry.init({
  dsn: '…',
  _experimentalUseOrchestrion: true,
});

_experimentalSetupOrchestrion(client);
// Or, to override which integrations are registered:
// _experimentalSetupOrchestrion(client, { integrations: [mysqlChannelIntegration()] });
```

This keeps the experiment self-contained — no parallel `init` function, no separate entry point — while still being fully tree-shakable for users who don't opt in.

## End-user surface

**Bundled app (Vite):**

```ts
// vite.config.ts
import { sentryOrchestrionPlugin } from '@sentry/node/orchestrion/vite';
export default { plugins: [sentryOrchestrionPlugin()] };

// app.ts
import * as Sentry from '@sentry/node';
import { _experimentalSetupOrchestrion } from '@sentry/node';

const client = Sentry.init({
  dsn: '…',
  _experimentalUseOrchestrion: true,
});
_experimentalSetupOrchestrion(client);
```

**Unbundled Node ESM app:**

```bash
node --import @sentry/node/orchestrion app.js
```

```ts
// app.ts — same two-step init + setup as above, no plugin needed.
```

**Unbundled Node CJS app:**

```bash
node --require @sentry/node/orchestrion app.js
```

If the user does **neither** runtime nor bundler hook, `_experimentalSetupOrchestrion()` warns at startup. If they do **both**, it also warns. If they set `_experimentalUseOrchestrion: true` but never call `_experimentalSetupOrchestrion()`, they get no channel-based spans and no OTel-based spans for the replaced libraries — also a warning case (emitted lazily the first time the client tries to flush, since we can't observe the missing call directly at `init()` time). TBD whether this third warning is worth the complexity.

## Double-wrap analysis — what orchestrion does and doesn't protect against

| Failure mode                                                     | Who catches it                                                                                                        | How                                                                                                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Bundler plugin added twice in the same Vite config               | orchestrion's bundler plugin itself? **Unverified** — needs a test during the spike. If not, our marker plugin warns. | `__SENTRY_ORCHESTRION__.bundler` already true at second plugin invocation.                                                            |
| `--import @sentry/node/orchestrion` passed twice on CLI          | Our hook                                                                                                              | Marker set before `register()`, second load short-circuits with a warn.                                                               |
| Bundler plugin + runtime hook both run                           | Our `detect.ts` at `Sentry.init`                                                                                      | Warn — this is the most likely real-world footgun, since a Vite-built app may still launch with a stray `--import` from prod tooling. |
| Neither runs                                                     | Our `detect.ts`                                                                                                       | Warn — user thinks Sentry instruments their DB but it silently doesn't.                                                               |
| Orchestrion patches a function the user already patched manually | **Out of scope** for this experiment. Document it.                                                                    | n/a                                                                                                                                   |

## Implementation phases

1. **Plumbing first** — branch (done), add the three orchestrion packages to `packages/node/package.json` as `dependencies`, create `orchestrion/` directory with empty `config.ts`, `channels.ts`, `detect.ts`. No real channels yet. Build passes.
2. **Runtime path end-to-end** — wire `import-hook.mjs` + the rollup config in `packages/node/rollup.npm.config.mjs` to emit it. Verify with a throwaway script that has _one_ instrumentation in `config.ts` (a function in a tiny local fixture module) that publishing fires.
3. **Mysql channel integration** — write `integrations/tracing-channel/mysql.ts`. Plug into a `dev-packages/node-integration-tests/` scenario that runs against a real mysql container, asserts spans.
4. **Bundler path** — add `sentryOrchestrionPlugin()` for Vite, including marker injection. Test in a small fixture under `dev-packages/e2e-tests/` (Vite-built Node entry hitting mysql).
5. **Detection + setup entry point** — add `detect.ts` + `setup.ts` (exporting `_experimentalSetupOrchestrion`), wire the `_experimentalUseOrchestrion` flag into `init()` so it filters the default integrations, and re-export `_experimentalSetupOrchestrion` from the package root. Test all four hook states (runtime only / bundler only / both / neither) via the e2e fixtures, plus a bundler-size assertion that not importing `_experimentalSetupOrchestrion` drops `orchestrion/*` from the output.
6. **Decide & write up** — capture findings in a follow-up doc: does this beat the OTel path on (a) bundle size, (b) cold start, (c) reliability, (d) maintenance cost?

## Open questions to settle during the spike

- **Does `@apm-js-collab/tracing-hooks` ship its own double-register guard?** Cheap to test — register twice, see if it complains. If yes, our runtime-path warning is belt-and-suspenders; if no, our marker is the only guard.
- **Does `code-transformer-bundler-plugins/vite` work cleanly with Vite's SSR / library modes?** Our likely consumers (Next, Nuxt, SvelteKit server bundles) all go through SSR pipelines.
- **`TracingChannel` callback context shape** — orchestrion docs describe the channel name + the `kind` (Sync/Async/Callback) but not the exact `context` payload (what `arguments`, `this`, `result`, `error` keys are present). Needs a quick `subscribe` + `console.log` smoke test before writing `mysql.ts`.
- **CJS vs ESM coverage** — does the runtime require-hook see ESM imports of mysql? Does the import-hook see CJS requires? The mysql package itself is CJS, but the consuming app may be either. Likely we need to wire both hooks together in `--import @sentry/node/orchestrion` (the ESM hook also patches CJS via the require-hook path).
- **How do we keep `SENTRY_INSTRUMENTATIONS` tree-shakable?** If a user only wants mysql, the unused configs shouldn't ship. Probably each integration owns its config fragment and `config.ts` aggregates via barrel import — TBD during phase 1.
