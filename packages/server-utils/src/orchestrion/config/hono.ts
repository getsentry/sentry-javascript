import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

// Hono is hooked through per-request internals only — never at module scope — which is what lets the
// same config run on Cloudflare Workers, where workerd forbids `diagnostics_channel` at module scope.
// The subscribers live in `honoIntegration`.
const honoInstrumentationConfig: InstrumentationConfig[] = [
  {
    // `new Context()` runs once per request: where the Sentry middleware is injected and matched
    // middleware handlers are wrapped for spans.
    channelName: 'context',
    module: { name: 'hono', versionRange: '>=4.0.0 <5', filePath: /^dist\/(?:cjs\/)?context\.js$/ },
    functionQuery: { className: 'Context' },
  },
  {
    // `app.request(...)` — Hono's internal dispatch for sub-app-to-sub-app fetches. A class-field
    // arrow, hence `astQuery` instead of `methodName`.
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
