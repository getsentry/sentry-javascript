import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';

/**
 * The central list of channel injections orchestrion should perform.
 *
 * This module has NO side effects — it's the only thing both the runtime hooks
 * (`runtime/import-hook.mjs`, `runtime/require-hook.cjs`) and the bundler plugins
 * (`bundler/vite.ts`, …) import from. Adding a new instrumented method is one
 * entry here plus one subscriber in `integrations/<lib>/tracing-channel.ts`.
 *
 * `channelName` here is the unprefixed suffix; the actual diagnostics_channel
 * name is `orchestrion:${module.name}:${channelName}` (see `channels.ts`).
 */
export const SENTRY_INSTRUMENTATIONS: InstrumentationConfig[] = [
  {
    channelName: 'query',
    module: { name: 'mysql', versionRange: '>=2.0.0 <3', filePath: 'lib/Connection.js' },
    // `Connection` in mysql v2 is a constructor function (NOT a class):
    //   `function Connection(options) { ... }`
    //   `Connection.prototype.query = function query(sql, values, cb) { ... }`
    // orchestrion's `className`+`methodName` query only matches `class` declarations.
    // The named function expression on the right-hand side of the prototype
    // assignment is what we want — that's matched by `expressionName: 'query'`,
    // which produces the esquery selector
    //   `AssignmentExpression[left.property.name="query"] > FunctionExpression[async]`.
    functionQuery: { expressionName: 'query', kind: 'Callback' },
  },
];
