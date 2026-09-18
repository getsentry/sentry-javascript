import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

// Hono is instrumented through its PER-REQUEST internals rather than at app construction or route
// registration. Two functions are wrapped, both of which only ever run while a request is being
// handled — never at module scope. That is what makes this work on Cloudflare Workers (workerd
// forbids `diagnostics_channel` publish/`runStores` at module scope) with no registration-time
// patching, while behaving identically under the Node/Deno runtime hook and the bundler plugins.
// The subscribers live in `honoIntegration`.
const honoInstrumentationConfig: InstrumentationConfig[] = [
  {
    // `new Context(req, { matchResult })` is created once per dispatched request, inside `#dispatch`
    // and BEFORE Hono's single-handler fast-path check. The subscriber injects the Sentry
    // request/response middleware into `matchResult[0]` (so it runs first, in the composed chain —
    // which also forces the ≥2-handler path, giving uniform route naming and error capture) and
    // wraps the matched middleware handlers for spans. Copied sub-app handlers are already present in
    // `matchResult`, so they are covered automatically.
    channelName: 'context',
    module: { name: 'hono', versionRange: '>=4.0.0 <5', filePath: /^dist\/(?:cjs\/)?context\.js$/ },
    functionQuery: { className: 'Context' },
  },
  {
    // `app.request(...)` is Hono's internal dispatch entry (a class-field arrow, so it needs an
    // `astQuery` rather than a `methodName`). Sub-app-to-sub-app internal fetches go through it; each
    // gets an `http.server` child span (only when there is a parent span).
    channelName: 'request',
    module: { name: 'hono', versionRange: '>=4.0.0 <5', filePath: /^dist\/(?:cjs\/)?hono-base\.js$/ },
    astQuery: "PropertyDefinition[key.name='request'] > ArrowFunctionExpression",
    functionQuery: { kind: 'Auto' },
  },
];

export const honoConfig = honoInstrumentationConfig satisfies InstrumentationConfig[];

export const honoModuleNames = getModuleNames(honoConfig);

export const honoChannels = {
  HONO_CONTEXT: 'orchestrion:hono:context',
  HONO_REQUEST: 'orchestrion:hono:request',
} as const;
