import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn, Span } from '@sentry/core';
import { debug, defineIntegration, getActiveSpan, waitForTracingChannelBinding } from '@sentry/core';
import { subscribeMongooseDiagnosticChannels } from '../../mongoose/mongoose-dc-subscriber';
import type { MongooseLegacyCollection } from '../../mongoose/mongoose-legacy-span';
import { startMongooseLegacySpan } from '../../mongoose/mongoose-legacy-span';
import { CHANNELS } from '../../orchestrion/channels';
import { MONGOOSE_CONTEXT_CAPTURE_CHANNELS } from '../../orchestrion/config/mongoose';
import { DEBUG_BUILD } from '../../debug-build';
import type { SentryTracingChannel } from '../../tracing-channel';
import { bindTracingChannelToSpan } from '../../tracing-channel';

const INTEGRATION_NAME = 'Mongoose' as const;

// Origin distinguishes the orchestrion path from the OTel/IITM path
// (`auto.db.otel.mongoose`) and the native diagnostics_channel path
// (`auto.db.mongoose.diagnostic_channel`).
const ORIGIN = 'auto.db.orchestrion.mongoose';

interface MongooseQuery {
  mongooseCollection?: MongooseLegacyCollection;
  model?: { modelName?: string };
  op?: string;
}

interface MongooseAggregate {
  _model?: { collection?: MongooseLegacyCollection; modelName?: string };
}

interface MongooseModelStatic {
  collection?: MongooseLegacyCollection;
  modelName?: string;
}

interface MongooseDocument {
  constructor: { collection?: MongooseLegacyCollection; modelName?: string };
}

/**
 * The shape orchestrion's transform attaches to the tracing-channel context
 * object. `self` is the `this` of the traced method
 */
interface MongooseChannelContext {
  self?: object;
  arguments?: unknown[];
  result?: unknown;
  error?: unknown;
  moduleVersion?: string;
}

// The active span captured when a query/aggregate was *built*, keyed by the
// query/aggregate object.
//
// Used as the parent for the span created at `exec()` so a query parents to
// where it was built, not where it happens to be awaited. A WeakMap avoids
// mutating mongoose's own objects.
const STORED_PARENT_SPAN = new WeakMap<object, Span>();

let orchestrionSubscribed = false;

const _mongooseChannelIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      waitForTracingChannelBinding(() => {
        // mongoose >= 9.7 publishes via its own diagnostics_channel; reuse
        // the shared native subscriber so this single integration covers all
        // versions after it replaces the OTel one. Idempotent and inert on
        // < 9.7 (those channels just never get published to)
        subscribeMongooseDiagnosticChannels(diagnosticsChannel.tracingChannel);

        // mongoose < 9.7 is covered by the orchestrion-injected channels.
        subscribeOrchestrionMongooseChannels();
      });
    },
  };
}) satisfies IntegrationFn;

function subscribeOrchestrionMongooseChannels(): void {
  if (orchestrionSubscribed) {
    return;
  }
  orchestrionSubscribed = true;

  DEBUG_BUILD && debug.log('[orchestrion:mongoose] subscribing to injected channels');

  // Context-capture builders: stash the active span at build time so `exec()`
  // can parent to it.
  for (const channelName of MONGOOSE_CONTEXT_CAPTURE_CHANNELS) {
    channel(channelName).subscribe({
      start(message) {
        stashParentSpan(message.self);
      },
    });
  }

  // `Model.aggregate()` returns the aggregate it builds; stash the parent on
  // the returned object.
  channel(CHANNELS.MONGOOSE_MODEL_AGGREGATE).subscribe({
    end(message) {
      const result = message.result;
      if (result && typeof result === 'object') {
        stashParentSpan(result);
      }
    },
  });

  // Query execution.
  bindExecSpan(CHANNELS.MONGOOSE_QUERY_EXEC, self => {
    const query = self as MongooseQuery;
    return startSpan(
      query.mongooseCollection,
      query.model?.modelName,
      query.op ?? 'exec',
      STORED_PARENT_SPAN.get(self),
    );
  });

  // Aggregation execution.
  bindExecSpan(CHANNELS.MONGOOSE_AGGREGATE_EXEC, self => {
    const model = (self as MongooseAggregate)._model;
    return startSpan(model?.collection, model?.modelName, 'aggregate', STORED_PARENT_SPAN.get(self));
  });

  // `doc.save()` (and the `$save` alias).
  bindExecSpan(CHANNELS.MONGOOSE_MODEL_SAVE, self => {
    const ctor = (self as MongooseDocument).constructor;
    return startSpan(ctor.collection, ctor.modelName, 'save');
  });

  // `doc.remove()` (mongoose 5/6).
  bindExecSpan(CHANNELS.MONGOOSE_MODEL_REMOVE, self => {
    const ctor = (self as MongooseDocument).constructor;
    return startSpan(ctor.collection, ctor.modelName, 'remove');
  });

  // Static batch operations. `self` is the Model.
  bindExecSpan(CHANNELS.MONGOOSE_MODEL_INSERT_MANY, self => {
    const model = self as MongooseModelStatic;
    return startSpan(model.collection, model.modelName, 'insertMany');
  });
  bindExecSpan(CHANNELS.MONGOOSE_MODEL_BULK_WRITE, self => {
    const model = self as MongooseModelStatic;
    return startSpan(model.collection, model.modelName, 'bulkWrite');
  });
}

function startSpan(
  collection: MongooseLegacyCollection | undefined,
  modelName: string | undefined,
  operation: string,
  parentSpan?: Span,
): Span {
  return startMongooseLegacySpan({ collection, modelName, operation, origin: ORIGIN, parentSpan });
}

// `SentryTracingChannel` relaxes Node's subscriber type to a `Partial`, so a
// `start`-only (or `end`-only) subscriber for the context-capture channels
// is accepted.
function channel(channelName: string): SentryTracingChannel<MongooseChannelContext> {
  return diagnosticsChannel.tracingChannel<MongooseChannelContext>(
    channelName,
  ) as unknown as SentryTracingChannel<MongooseChannelContext>;
}

function bindExecSpan(channelName: string, getSpan: (self: object) => Span): void {
  bindTracingChannelToSpan<MongooseChannelContext>(
    diagnosticsChannel.tracingChannel<MongooseChannelContext>(channelName),
    data => {
      const self = data.self;
      if (!self) {
        return undefined;
      }
      return getSpan(self);
    },
  );
}

function stashParentSpan(self: object | undefined): void {
  const active = getActiveSpan();
  if (self && active) {
    STORED_PARENT_SPAN.set(self, active);
  }
}

/**
 * EXPERIMENTAL: orchestrion-driven mongoose integration.
 *
 * Reproduces the vendored `@opentelemetry/instrumentation-mongoose` span
 * shape (legacy db/net semantic conventions, `mongoose.<Model>.<op>` names,
 * build-time span parenting) via the `orchestrion:mongoose:*`
 * diagnostics_channels injected into mongoose `< 9.7` by the orchestrion
 * code transform. For mongoose `>= 9.7` it also drives the native
 * diagnostics_channel subscription, so this single integration covers every
 * supported version once it replaces the OTel one.
 */
export const mongooseChannelIntegration = defineIntegration(_mongooseChannelIntegration);
