import type { InstrumentationConfig } from '..';
import { toSubscribeInjections } from './subscribe-injection';

// mongoose >= 9.7.0 publishes via its own `node:diagnostics_channel` tracing channels (handled by
// `subscribeMongooseDiagnosticChannels`), so this transform is gated to `< 9.7.0` to avoid emitting
// two spans per operation. The lower bound mirrors the vendored OTel IITM patcher's supported range.
const module = { name: 'mongoose', versionRange: '>=5.9.7 <9.7.0' } as const;

// mongoose defines its prototype/static methods as assignments
// (`Query.prototype.find = function(...)`, most of them anonymous), so the
// transform matches the assigned property name via `expressionName`
// rather than the function name. Entries whose method does not exist in a
// given major are simply inert.

// Builder methods that run synchronously and return a `Query`/`Aggregate`.
// They don't get their own span; the subscriber only reads the active span
// at build time and stashes it on the query so the later `exec()` can parent
// to where the query was *built*, not where it is awaited. `kind: 'Sync'`
// so the returned thenable isn't mistaken for the traced operation's result.
const CONTEXT_CAPTURE_QUERY_METHODS = [
  'find',
  'findOne',
  'deleteOne',
  'deleteMany',
  'estimatedDocumentCount',
  'countDocuments',
  'distinct',
  'where',
  '$where',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  // 5/6/7 only (removed in 8), inert in recent versions
  'remove',
  'count',
  'findOneAndRemove',
] as const;

export const mongooseConfig = [
  // Query execution
  // the span for most read/write operations. `op`, collection and model are
  // read off the `Query` at exec time.
  {
    channelName: 'query_exec',
    module: { ...module, filePath: 'lib/query.js' },
    functionQuery: { expressionName: 'exec', kind: 'Auto' },
  },
  // Aggregation pipeline execution.
  {
    channelName: 'aggregate_exec',
    module: { ...module, filePath: 'lib/aggregate.js' },
    functionQuery: { expressionName: 'exec', kind: 'Auto' },
  },
  // `doc.save()` (and its `$save` alias, which mongoose points at `save` on
  // require. the alias picks up the transformed body automatically, so no
  // separate entry is needed).
  {
    channelName: 'model_save',
    module: { ...module, filePath: 'lib/model.js' },
    functionQuery: { expressionName: 'save', kind: 'Auto' },
  },
  // Static batch operations.
  {
    channelName: 'model_insert_many',
    module: { ...module, filePath: 'lib/model.js' },
    functionQuery: { expressionName: 'insertMany', kind: 'Auto' },
  },
  {
    channelName: 'model_bulk_write',
    module: { ...module, filePath: 'lib/model.js' },
    functionQuery: { expressionName: 'bulkWrite', kind: 'Auto' },
  },
  // `doc.remove()` (a document method, deprecated in 6 and removed in 7)
  // `expressionName: 'remove'` also matches the sibling `Model.remove`
  // *static* in this file, which no matcher can tell apart from the prototype
  // method; that static is deprecated and would just produce a redundant span
  // so the collision is accepted rather than dropping the doc-method span.
  {
    channelName: 'model_remove',
    module: { ...module, filePath: 'lib/model.js' },
    functionQuery: { expressionName: 'remove', kind: 'Auto' },
  },
  // NOTE: document `updateOne`/`deleteOne` (mongoose 8.21+) are deliberately
  // NOT hooked here. The vendored OTel/IITM patcher wraps
  // `Model.prototype.updateOne`/`deleteOne`, but those delegate to
  // `Query.exec`, which the `query_exec` channel above already instruments
  // (its `this.op` is the right operation). Verified by the `mongoose-v8`
  // suite against a real mongoose 8.21+ under orchestrion. A dedicated hook
  // is also not possible cleanly: `expressionName: 'updateOne'` in
  // `lib/model.js` can't be told apart from the same-named `Model.updateOne`
  // *static* (the common query-builder form), so hooking it would double-span
  // every `Model.updateOne(...)` call.
  //
  // `Model.aggregate()` builds an `Aggregate` with no method to hook for
  // context capture, so hook the static itself and stash the active span
  // on the returned aggregate. `Sync`: it returns the aggregate.
  {
    channelName: 'model_aggregate',
    module: { ...module, filePath: 'lib/model.js' },
    functionQuery: { expressionName: 'aggregate', kind: 'Sync' },
  },
  ...CONTEXT_CAPTURE_QUERY_METHODS.map(methodName => ({
    channelName: `ctx_${methodName}`,
    module: { ...module, filePath: 'lib/query.js' },
    functionQuery: { expressionName: methodName, kind: 'Sync' as const },
  })),
] satisfies InstrumentationConfig[];

export const mongooseChannels = {
  MONGOOSE_QUERY_EXEC: 'orchestrion:mongoose:query_exec',
  MONGOOSE_AGGREGATE_EXEC: 'orchestrion:mongoose:aggregate_exec',
  MONGOOSE_MODEL_SAVE: 'orchestrion:mongoose:model_save',
  MONGOOSE_MODEL_INSERT_MANY: 'orchestrion:mongoose:model_insert_many',
  MONGOOSE_MODEL_BULK_WRITE: 'orchestrion:mongoose:model_bulk_write',
  MONGOOSE_MODEL_REMOVE: 'orchestrion:mongoose:model_remove',
  MONGOOSE_MODEL_AGGREGATE: 'orchestrion:mongoose:model_aggregate',
} as const;

/**
 * Fully-qualified names of the context-capture channels, derived from the
 * same method list the transform config uses so the two can't drift. The
 * subscriber subscribes to all of them uniformly to stash the build-time
 * parent span (see `mongooseChannels` for the span-creating channels).
 */
export const MONGOOSE_CONTEXT_CAPTURE_CHANNELS: string[] = CONTEXT_CAPTURE_QUERY_METHODS.map(
  methodName => `orchestrion:mongoose:ctx_${methodName}`,
);

export const mongooseSubscribeInjection = toSubscribeInjections(mongooseConfig);
