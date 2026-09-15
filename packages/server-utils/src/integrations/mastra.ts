import * as diagnosticsChannel from 'node:diagnostics_channel';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IntegrationFn } from '@sentry/core';
import {
  captureException,
  consoleSandbox,
  debug,
  defineIntegration,
  GLOBAL_OBJ,
  isObjectLike,
  withActiveSpan,
} from '@sentry/core';
import {
  COMMUNITY_MASTRA_SENTRY_EXPORTER_NAME,
  MASTRA_EXPORTER_BRAND,
  MASTRA_INTEGRATION_NAME,
} from '../ai/mastra/constants';
import { SentryMastraExporter } from '../ai/mastra';
import type { MastraExporterOptions } from '../ai/mastra';
import { getSentrySpanForMastraId } from '../ai/mastra/span-registry';
import type { MastraObservabilityExporter } from '../ai/mastra/types';
import { DEBUG_BUILD } from '../debug-build';
import { CHANNELS } from '../orchestrion/channels';
import { mastraModuleNames } from '../orchestrion/config/mastra';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import { bindSpanToChannelStore, safeChannelCallback } from '../tracing-channel';

export interface MastraOptions extends MastraExporterOptions {
  /**
   * Construct a Mastra observability pipeline when the app has not configured one. Defaults to
   * `true`. Uses an `@mastra/observability` the app already has; the SDK never installs it.
   */
  bootstrapObservability?: boolean;
}

interface MastraObservabilityInstance {
  getExporters?: () => readonly { name?: string; [MASTRA_EXPORTER_BRAND]?: boolean }[];
}

interface MastraInstance {
  registerExporter?: (exporter: unknown, instance: unknown, entrypoint: unknown) => void;
  observability?: { getDefaultInstance?: () => MastraObservabilityInstance | undefined };
}

interface ConstructorChannelContext {
  arguments: unknown[];
  self?: unknown;
}

interface ExecuteWithContextChannelContext {
  // `executeWithContext({ span, fn })` — the first arg carries the Mastra AISpan.
  arguments: unknown[];
}

/** Mastra AISpan → the id the exporter keys its Sentry span on. */
function mastraSpanId(span: unknown): string | undefined {
  if (!isObjectLike(span)) {
    return undefined;
  }
  const exported = span.getExportedSpanId;
  const id = typeof exported === 'function' ? exported.call(span) : span.id;
  return typeof id === 'string' ? id : undefined;
}

// `registerExporter` does not dedupe; WeakSet so short-lived instances stay collectable.
const registered = new WeakSet<object>();

// Process-wide: several Mastra instances should not reprint this.
let warnedAboutCommunityExporter = false;
let warnedAboutMissingObservability = false;

const _mastraIntegration = ((options: MastraOptions = {}) => {
  return {
    name: MASTRA_INTEGRATION_NAME,
    setup(client) {
      // Attaching the exporter and capturing errors open no spans, so a missing async-context binding
      // must not defer them.
      invokeOrchestrionInstrumentation(client, mastraModuleNames, instrumentExporter, [options], {
        requiresTracingChannelBinding: false,
      });
      // The `executeWithContext` bridge binds spans into the async context, so it must wait for the
      // async-context binding (e.g. a custom OpenTelemetry setup wires it up late).
      invokeOrchestrionInstrumentation(client, mastraModuleNames, instrumentExecuteWithContext, []);
    },
  };
}) satisfies IntegrationFn;

function instrumentExporter(options: MastraOptions): void {
  diagnosticsChannel.tracingChannel<ConstructorChannelContext>(CHANNELS.MASTRA_CONSTRUCTOR).end.subscribe(message => {
    safeChannelCallback(() => {
      const { self } = message as ConstructorChannelContext;
      attachExporter(self, options);
    });
  });

  captureExecuteWithContextErrors();
}

/**
 * Capture errors thrown by Mastra operations as Sentry issues. Mastra runs each operation's work
 * inside `executeWithContext({ span, fn })`; when `fn` rejects, the channel's `error` carries the real
 * `Error` (with a stack), so we capture that rather than the exporter's stack-less `errorInfo`.
 * Associated with the exporter's span for that operation so it lands on the right trace. Capturing needs
 * no async context binding, so it rides the attach-only path.
 */
function captureExecuteWithContextErrors(): void {
  diagnosticsChannel
    .tracingChannel<ExecuteWithContextChannelContext>(CHANNELS.MASTRA_EXECUTE_WITH_CONTEXT)
    .error.subscribe(message => {
      safeChannelCallback(() => {
        const data = message as ExecuteWithContextChannelContext & { error: unknown };
        captureMastraError(data.error, (data.arguments as unknown[] | undefined)?.[0]);
      });
    });
}

/** Bound on the `cause` walk; a self- or cyclic `cause` from a wrapped error would otherwise hang. */
const MAX_CAUSE_CHAIN_DEPTH = 10;

// Errors we've already captured, plus everything they wrap. Mastra re-throws failures wrapped in a
// `new MastraError({ cause })`, so the same failure surfaces at outer operations as a *different*
// object — `captureException`'s identity dedup can't see that, but the shared `cause` can.
const capturedErrors = new WeakSet<object>();

function errorCauseChain(error: unknown): object[] {
  const chain: object[] = [];
  let current = error;
  for (let depth = 0; depth < MAX_CAUSE_CHAIN_DEPTH && isObjectLike(current); depth++) {
    chain.push(current);
    const cause = (current as { cause?: unknown }).cause;
    if (cause === current) {
      break;
    }
    current = cause;
  }
  return chain;
}

function captureMastraError(error: unknown, params: unknown): void {
  const chain = errorCauseChain(error);
  // Skip if this error — or anything it wraps, or anything wrapping it — was already captured.
  if (chain.some(link => capturedErrors.has(link))) {
    return;
  }
  chain.forEach(link => capturedErrors.add(link));

  const id = isObjectLike(params) ? mastraSpanId(params.span) : undefined;
  const span = id ? getSentrySpanForMastraId(id) : undefined;
  const capture = (): string => captureException(error, { mechanism: { type: 'auto.ai.mastra', handled: false } });

  // Attach to the operation's span so the issue lands on the right trace, when the span is still open.
  if (span) {
    withActiveSpan(span, capture);
  } else {
    capture();
  }
}

/**
 * Mastra runs each operation's work inside `executeWithContext({ span, fn })`. Bind the exporter's
 * Sentry span for that Mastra span into the async context for the call, so nested auto-instrumented
 * work (the model `fetch`, a `dataloader.load` in a tool) parents under it. This activates an existing
 * exporter span — it never opens or ends one; the exporter owns the span lifecycle.
 */
function instrumentExecuteWithContext(): void {
  bindSpanToChannelStore(
    diagnosticsChannel.tracingChannel<ExecuteWithContextChannelContext>(CHANNELS.MASTRA_EXECUTE_WITH_CONTEXT),
    data => {
      const params = (data.arguments as unknown[] | undefined)?.[0];
      const id = isObjectLike(params) ? mastraSpanId(params.span) : undefined;
      return id ? getSentrySpanForMastraId(id) : undefined;
    },
  );
}

function attachExporter(instance: unknown, options: MastraOptions): void {
  if (typeof instance !== 'object' || instance === null || registered.has(instance)) {
    return;
  }

  const mastra = instance as MastraInstance;
  if (typeof mastra.registerExporter !== 'function') {
    DEBUG_BUILD &&
      debug.log('[instrumentation:mastra] `Mastra.registerExporter` is missing; needs @mastra/core >= 1.63.2');
    return;
  }

  const { bootstrapObservability: _bootstrapObservability, ...exporterOptions } = options;
  const exporter = new SentryMastraExporter(exporterOptions);

  const defaultInstance = mastra.observability?.getDefaultInstance?.();
  if (defaultInstance) {
    const exporters = defaultInstance.getExporters?.() ?? [];

    if (exporters.some(registeredExporter => registeredExporter?.[MASTRA_EXPORTER_BRAND])) {
      markAttached(instance);
      DEBUG_BUILD && debug.log('[instrumentation:mastra] a Sentry exporter is already registered, skipping');
      return;
    }

    // Community exporter already called `Sentry.init()` and cannot be removed (add-only API).
    if (exporters.some(registeredExporter => registeredExporter?.name === COMMUNITY_MASTRA_SENTRY_EXPORTER_NAME)) {
      warnAboutCommunityExporter();
    }

    mastra.registerExporter(exporter, undefined, undefined);
    markAttached(instance);
    return;
  }

  if (options.bootstrapObservability === false) {
    DEBUG_BUILD &&
      debug.log('[instrumentation:mastra] no observability configured and bootstrapping is disabled, skipping');
    return;
  }

  const bootstrap = createObservabilityBootstrap(exporter);
  if (!bootstrap) {
    return;
  }

  mastra.registerExporter(exporter, bootstrap.instance, bootstrap.entrypoint);
  markAttached(instance);
}

function markAttached(instance: object): void {
  registered.add(instance);
}

function warnAboutMissingObservability(): void {
  if (warnedAboutMissingObservability) {
    return;
  }
  warnedAboutMissingObservability = true;

  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn(
      '[Sentry] Mastra has no observability pipeline and `@mastra/observability` could not be loaded, ' +
        'so the Mastra integration will not create spans. Install `@mastra/observability`, or pass an ' +
        '`Observability` to the `Mastra` constructor. Disable this with ' +
        '`mastraIntegration({ bootstrapObservability: false })`.',
    );
  });
}

/** `console.warn` rather than `debug`: the app's Sentry client has been replaced. */
function warnAboutCommunityExporter(): void {
  if (warnedAboutCommunityExporter) {
    return;
  }
  warnedAboutCommunityExporter = true;

  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn(
      '[Sentry] The `@mastra/sentry` package is registered alongside the built-in Mastra integration, ' +
        'and both are now exporting spans. Its exporter also calls `Sentry.init()` itself: depending on which ' +
        '`@sentry/node` version it resolves to, that either replaces the client configured in your ' +
        '`instrument.ts` — losing your release, environment, integrations and sampling — or starts a second, ' +
        'independent SDK whose events never reach yours. Remove `@mastra/sentry` from your Mastra `exporters`; ' +
        'the Sentry SDK instruments Mastra on its own.',
    );
  });
}

// `createRequire` treats its argument as a filename and resolves from `dirname(that)`.
// Passing cwd itself would look in cwd's parent, so this dummy file (never loaded) keeps
// resolution rooted at the app directory.
function cwdRequireParent(): string {
  return join(process.cwd(), 'noop.js');
}

function appRequire(): ReturnType<typeof createRequire> {
  return createRequire(cwdRequireParent());
}

/**
 * The runtime injection hook records the resolved file of each instrumented module as it loads.
 * Unlike the CJS `require.cache`, this is populated for ESM-loaded modules too, so it is the
 * reliable anchor for finding the app's `@mastra/observability` next to its `@mastra/core`.
 */
function findInjectedMastraCoreFilename(): string | undefined {
  const url = GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.runtimeFiles?.['@mastra/core'];
  if (!url) {
    return undefined;
  }

  try {
    return url.startsWith('file:') ? fileURLToPath(url) : url;
  } catch {
    return undefined;
  }
}

/**
 * `@mastra/core` is already evaluated (we are in its constructor). Prefer that file so a
 * serverless/test cwd that is not the app still finds the app's `@mastra/observability`.
 * Only sees CJS-loaded modules; ESM apps rely on {@link findInjectedMastraCoreFilename}.
 */
function findLoadedMastraCoreFilename(): string | undefined {
  const cache = appRequire().cache;
  if (!cache) {
    return undefined;
  }

  for (const filename of Object.keys(cache)) {
    if (filename.replace(/\\/g, '/').includes('/@mastra/core/')) {
      return filename;
    }
  }

  return undefined;
}

function tryRequireObservability(parent: string): Record<string, unknown> | undefined {
  try {
    return createRequire(parent)('@mastra/observability') as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Prefer the runtime-injected `@mastra/core` file (works under ESM and CJS), then the CJS-cached
 * copy, then cwd-resolved core, then cwd itself. A hit can still fail under pnpm if that copy
 * cannot see `@mastra/observability`, hence the fallbacks.
 */
function loadMastraObservability(): Record<string, unknown> {
  // A bundled runtime (e.g. Cloudflare Workers) has no on-disk `node_modules` to
  // `createRequire` against. `@sentry/cloudflare/vite` splices a static provider import
  // into this module that stashes the `@mastra/observability` namespace on the global
  // marker, so prefer that when present.
  const injected = GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.providedModules?.['@mastra/observability'];
  if (injected) {
    return injected;
  }

  const parents = new Set<string>();
  const injectedCore = findInjectedMastraCoreFilename();
  if (injectedCore) {
    parents.add(injectedCore);
  }
  const loadedCore = findLoadedMastraCoreFilename();
  if (loadedCore) {
    parents.add(loadedCore);
  }
  try {
    parents.add(appRequire().resolve('@mastra/core'));
  } catch {
    // cwd is not the app, or `@mastra/core` is ESM-only and not in the CJS resolver.
  }
  parents.add(cwdRequireParent());

  for (const parent of parents) {
    const observability = tryRequireObservability(parent);
    if (observability) {
      return observability;
    }
  }

  throw new Error('Cannot resolve @mastra/observability');
}

/**
 * Mastra's default is a no-op with no pipeline. `@mastra/observability` is not a dependency of
 * `@mastra/core`, so this no-ops if the app has not installed it.
 */
function createObservabilityBootstrap(
  exporter: MastraObservabilityExporter,
): { instance: unknown; entrypoint: unknown } | undefined {
  let observabilityModule: Record<string, unknown>;
  try {
    observabilityModule = loadMastraObservability();
  } catch {
    warnAboutMissingObservability();
    return undefined;
  }

  const Observability = observabilityModule.Observability as
    | (new (config: unknown) => Record<string, unknown>)
    | undefined;
  const DefaultObservabilityInstance = observabilityModule.DefaultObservabilityInstance as
    | (new (config: unknown) => unknown)
    | undefined;

  if (!Observability || !DefaultObservabilityInstance) {
    DEBUG_BUILD && debug.log('[instrumentation:mastra] `@mastra/observability` is missing expected exports');
    return undefined;
  }

  return {
    instance: new DefaultObservabilityInstance({ serviceName: 'mastra', exporters: [exporter] }),
    // Empty registry: `new Observability({ configs: { default } })` already registers
    // `"default"`, and `Mastra.registerExporter` then throws `Tracing instance 'default' already registered`.
    entrypoint: new Observability({}),
  };
}

/**
 * Hooks the `Mastra` constructor and registers a Sentry exporter via `registerExporter()`.
 * Enabled by default. Disable with
 * `defaultIntegrations: integrations => integrations.filter(i => i.name !== 'Mastra')`.
 * Requires the runtime hook or bundler plugin, and `@mastra/core >= 1.63.2`.
 */
export const mastraIntegration = defineIntegration(_mastraIntegration);
