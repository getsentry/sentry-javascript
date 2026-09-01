import * as diagnosticsChannel from 'node:diagnostics_channel';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { IntegrationFn } from '@sentry/core';
import { consoleSandbox, debug, defineIntegration } from '@sentry/core';
import {
  COMMUNITY_MASTRA_SENTRY_EXPORTER_NAME,
  MASTRA_EXPORTER_BRAND,
  MASTRA_INTEGRATION_NAME,
} from '../ai/mastra/constants';
import { SentryMastraExporter } from '../ai/mastra';
import type { MastraExporterOptions } from '../ai/mastra';
import type { MastraObservabilityExporter } from '../ai/mastra/types';
import { DEBUG_BUILD } from '../debug-build';
import { CHANNELS } from '../orchestrion/channels';
import { mastraModuleNames } from '../orchestrion/config/mastra';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';

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

// `registerExporter` does not dedupe; WeakSet so short-lived instances stay collectable.
const registered = new WeakSet<object>();

// Process-wide: several Mastra instances should not reprint this.
let warnedAboutCommunityExporter = false;
let warnedAboutMissingObservability = false;

const _mastraIntegration = ((options: MastraOptions = {}) => {
  return {
    name: MASTRA_INTEGRATION_NAME,
    setup(client) {
      // The subscriber opens no spans, so a missing async-context binding must not defer it.
      invokeOrchestrionInstrumentation(client, mastraModuleNames, instrumentMastra, [options], {
        requiresTracingChannelBinding: false,
      });
    },
  };
}) satisfies IntegrationFn;

function instrumentMastra(options: MastraOptions): void {
  diagnosticsChannel.tracingChannel<ConstructorChannelContext>(CHANNELS.MASTRA_CONSTRUCTOR).end.subscribe(message => {
    try {
      const { self } = message as ConstructorChannelContext;
      attachExporter(self, options);
    } catch (error) {
      DEBUG_BUILD && debug.error('[instrumentation:mastra] failed to register the Sentry exporter', error);
    }
  });
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

function appRequire(): ReturnType<typeof createRequire> {
  return createRequire(join(process.cwd(), 'noop.js'));
}

/**
 * `@mastra/core` is already evaluated (we are in its constructor). Prefer that file so a
 * serverless/test cwd that is not the app still finds the app's `@mastra/observability`.
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
 * Prefer the already-loaded `@mastra/core` file, then cwd-resolved core, then cwd itself.
 * A cache hit can still fail under pnpm if that copy cannot see `@mastra/observability`.
 */
function loadMastraObservability(): Record<string, unknown> {
  const parents = new Set<string>();
  const loadedCore = findLoadedMastraCoreFilename();
  if (loadedCore) {
    parents.add(loadedCore);
  }
  try {
    parents.add(appRequire().resolve('@mastra/core'));
  } catch {
    // cwd is not the app, or `@mastra/core` is ESM-only and not in the CJS resolver.
  }
  parents.add(join(process.cwd(), 'noop.js'));

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
